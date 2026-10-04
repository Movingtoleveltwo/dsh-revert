window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: () => {
    const name = "dsh-revert";
    const inject = ["sessions", "uiConversation", "uiSession", "workspaces", "uiWorkspace", "conversation"];

    let isReverting = false;

    function injectStyles() {
      if (document.getElementById("dsh-revert-styles")) return;
      const style = document.createElement("style");
      style.id = "dsh-revert-styles";
      style.textContent = `
        .dsh-revert-icon-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: calc(28px + var(--dsh-content-font-delta, 0px)) !important;
          height: calc(28px + var(--dsh-content-font-delta, 0px)) !important;
          padding: 6px !important;
          border: none !important;
          border-radius: var(--dsw-radius-sm, 6px) !important;
          background: transparent !important;
          color: var(--dsw-alias-label-tertiary) !important;
          cursor: pointer !important;
          transition: background-color 0.15s ease, color 0.15s ease !important;
          user-select: none !important;
          box-sizing: border-box !important;
        }
        .dsh-revert-icon-btn:hover {
          background: var(--dsw-alias-interactive-bg-hover) !important;
          color: var(--dsw-alias-label-secondary) !important;
        }
        .dsh-revert-icon-btn:focus,
        .dsh-revert-icon-btn:focus-visible {
          outline: none !important;
          background: transparent !important;
        }
        .dsh-revert-icon-btn:hover:focus {
          background: var(--dsw-alias-interactive-bg-hover) !important;
        }
        .dsh-revert-icon-btn svg,
        .dsh-revert-icon-btn svg path {
          width: calc(15px + var(--dsh-content-font-delta, 0px)) !important;
          height: calc(15px + var(--dsh-content-font-delta, 0px)) !important;
          fill: none !important;
          stroke: currentColor !important;
        }
      `;
      document.head.appendChild(style);
    }

    function getCleanText(bubble) {
      if (!bubble) return "";
      const clone = bubble.cloneNode(true);
      clone.querySelectorAll(".dsh-revert-icon-btn").forEach(el => el.remove());
      return clone.textContent.trim();
    }

    function getNodeTurn(node) {
      const loc = node?.location;
      return (loc?.kind === "turn" || loc?.kind === "step") ? loc.turn?.turn : undefined;
    }

    // 查找目标保留轮次 (targetTurn) 的 turn/end 结束事件 seq
    function getForkSeqForTurn(binding, chatSnapshot, targetTurn) {
      if (!targetTurn || targetTurn <= 0) return undefined;

      const entries = binding?.eventSource?.getSnapshot()?.entries || [];
      for (const entry of entries) {
        if (entry.type === "turn/end" && entry.data?.turn === targetTurn && entry.seq > 0) {
          return entry.seq;
        }
      }

      const endSeq = chatSnapshot?.timeline?.turns?.get(targetTurn)?.end?.seq
        ?? chatSnapshot?.legacy?.turnEnds?.get(targetTurn);
      return (typeof endSeq === "number" && endSeq > 0) ? endSeq : undefined;
    }

    async function executeDirectRevert(ctx, { row, promptText }) {
      if (isReverting) return;
      isReverting = true;

      try {
        const { sessions, uiConversation, uiSession, workspaces, uiWorkspace, conversation } = ctx;

        const sessionId = uiSession.adapter.current.getSnapshot()?.key;
        if (!sessionId) throw new Error("No active session");

        const binding = sessions.binding(sessionId);
        const chatSnapshot = uiConversation.binding(sessionId).target("chat").getSnapshot();
        const summary = sessions.list.getSnapshot().byId[sessionId];

        // 1. 确定当前消息所在的轮次编号 (currentTurnNum)
        const turnSeatEl = row.closest("[data-chat-turn]");
        let currentTurnNum = Number(turnSeatEl?.dataset.chatTurn);

        if (!currentTurnNum || currentTurnNum <= 0) {
          const nodeKey = row.closest("[data-chat-node-key]")?.dataset.chatNodeKey;
          if (nodeKey) {
            currentTurnNum = getNodeTurn(chatSnapshot?.nodes?.get(nodeKey));
          }
        }

        if (!currentTurnNum || isNaN(currentTurnNum) || currentTurnNum <= 0) {
          console.error("[dsh-revert] 无法精确定位该消息所属的对话轮次编号，终止回退以保护代码安全。");
          window.alert("⚠️ 无法精确定位该消息所属的对话轮次编号，已阻止回退以保护代码安全。请刷新页面后重试。");
          return;
        }

        const safeTargetTurn = Math.max(0, currentTurnNum - 1);

        // Turn 0 二次确认拦截
        if (safeTargetTurn === 0) {
          const confirmed = window.confirm(
            "⚠️ 警告：您正在撤销第 1 轮对话。\n\n" +
            "此操作将会【清空当前会话的全部历史消息】，并将工作区所有被修改的代码文件恢复到【最初始状态】。\n\n" +
            "是否确认彻底清空并回滚？"
          );
          if (!confirmed) return;
        }

        const atSeq = safeTargetTurn > 0 ? getForkSeqForTurn(binding, chatSnapshot, safeTargetTurn) : undefined;
        if (safeTargetTurn > 0 && (!atSeq || atSeq <= 0)) {
          console.error(`[dsh-revert] 未能定位目标轮次 #${safeTargetTurn} 的截断位置 (atSeq)，终止操作。`);
          window.alert(`⚠️ 未能定位第 ${safeTargetTurn} 轮的历史截断点 (atSeq)，已终止回退以保护当前会话与代码安全。`);
          return;
        }

        // 2. 提取被撤回轮次的图片附件（如果有）与检测是否包含工具调用
        const extractedFiles = [];
        let hasToolCallsInRevertedTurns = false;
        const nodes = chatSnapshot?.nodes?.values() || [];

        for (const node of nodes) {
          const nodeTurn = getNodeTurn(node);
          if (!nodeTurn) continue;

          if (nodeTurn > safeTargetTurn && node.kind.includes("tool")) {
            hasToolCallsInRevertedTurns = true;
          }

          if (nodeTurn === currentTurnNum && (node.kind === "user" || node.kind === "steering") && binding?.session) {
            let imgIndex = 1;
            for (const block of (node.data?.content || [])) {
              if (block.type === "image" && block.attachment) {
                try {
                  const res = await binding.session.readAttachment(block.attachment.attachmentId);
                  if (res?.ok && res.value?.data) {
                    const mediaType = block.attachment.mediaType || res.value.attachment?.mediaType || "image/png";
                    extractedFiles.push(new File([new Blob([res.value.data], { type: mediaType })], `image-${imgIndex++}.png`, { type: mediaType }));
                  }
                } catch (e) {
                  console.warn("[dsh-revert] extract attachment err:", e);
                }
              }
            }
          }
        }

        if (!hasToolCallsInRevertedTurns) {
          const entries = binding?.eventSource?.getSnapshot()?.entries || [];
          hasToolCallsInRevertedTurns = entries.some(e => e.type === "tool/call" && e.data?.turn > safeTargetTurn);
        }

        // 3. 解析所属工作区，创建或 Fork 新会话
        const wsItems = workspaces.list.getSnapshot()?.items || [];
        const currentWorkspace = wsItems.find(item => item.sessionIds?.includes(sessionId))
          || wsItems.find(item => item.path === summary?.cwd);
        const targetWorkspaceId = currentWorkspace?.workspaceId;

        let childId;
        if (safeTargetTurn === 0) {
          childId = await sessions.create(targetWorkspaceId ? { workspaceId: targetWorkspaceId } : { cwd: summary?.cwd });
        } else {
          childId = await sessions.fork({ sessionId, atSeq, increaseTitle: false });
          fetch("/dsh-revert/rpc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "fork_session", payload: { oldSessionId: sessionId, newSessionId: childId, targetTurn: safeTargetTurn } }),
          }).catch(e => console.error("[dsh-revert] fork rpc error:", e));
        }

        if (targetWorkspaceId) {
          workspaces.insertSessionBefore(targetWorkspaceId, childId).catch(e => console.warn("[dsh-revert] insertSessionBefore err:", e));
        }

        // 4. 触发后端文件恢复
        fetch("/dsh-revert/rpc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "rollback",
            payload: {
              sessionId,
              targetTurn: safeTargetTurn,
              restoreFiles: hasToolCallsInRevertedTurns,
              isPureChat: !hasToolCallsInRevertedTurns,
              cwd: summary?.cwd,
            },
          }),
        }).catch(e => console.error("[dsh-revert] rollback rpc error:", e));

        // 5. 切换至新会话并归档旧会话
        uiWorkspace.openSession(childId);
        if (sessionId !== childId) {
          workspaces.archiveSession(sessionId).catch(e => console.warn("[dsh-revert] archiveSession err:", e));
        }

        // 6. 回填输入框草稿与图片附件
        let attachmentsRestored = extractedFiles.length === 0;
        const restoreComposerState = () => {
          try {
            const shell = conversation.input.shell(childId);
            if (promptText && shell.snapshot?.draft !== promptText) {
              shell.setDraft(promptText);
            }
            if (!attachmentsRestored) {
              const drafts = conversation.createDrafts(childId, extractedFiles);
              if (drafts.length > 0 && shell.addAttachments(drafts.map(d => d.id))) {
                attachmentsRestored = true;
              }
            }
          } catch {}
        };

        restoreComposerState();
        [80, 200, 450].forEach(ms => setTimeout(restoreComposerState, ms));
      } catch (err) {
        console.error("[dsh-revert] Error during revert:", err);
      } finally {
        isReverting = false;
      }
    }

    function attachUserRevertIcons(ctx) {
      const userRows = document.querySelectorAll('div[data-chat-flow-kind="user"], div[data-chat-flow-kind="steering"]');
      userRows.forEach((row) => {
        if (row.querySelector(".dsh-revert-icon-btn")) return;
        const actionsRow = row.querySelector('[class*="actions"]');
        const bubble = row.querySelector('[class*="bubble"]');
        if (!actionsRow && !bubble) return;

        const previewTurn = Number(row.closest("[data-chat-turn]")?.dataset.chatTurn);
        const copyBtn = actionsRow ? actionsRow.querySelector("button") : null;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `${copyBtn ? copyBtn.className : ""} dsh-revert-icon-btn`.trim();
        btn.setAttribute("aria-label", "撤销至此轮对话");
        btn.title = previewTurn > 0 ? `撤回此轮对话 (第 ${previewTurn} 轮)` : "一键撤回至此轮";
        btn.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5L2 7L5.5 10.5"/><path d="M2.5 7H9C11.5 7 13.5 9 13.5 11.5V12.5"/></svg>`;

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          executeDirectRevert(ctx, { row, promptText: getCleanText(bubble) });
        };

        if (actionsRow) {
          if (copyBtn?.nextSibling) actionsRow.insertBefore(btn, copyBtn.nextSibling);
          else actionsRow.appendChild(btn);
        } else {
          bubble.appendChild(btn);
        }
      });
    }

    function apply(ctx) {
      injectStyles();
      const observer = new MutationObserver(() => attachUserRevertIcons(ctx));
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => attachUserRevertIcons(ctx), 300);
    }

    return { name, inject, apply };
  },
});