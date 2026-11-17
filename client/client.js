window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: () => {
    const name = "dsh-revert";
    const inject = ["sessions", "uiConversation", "uiSession", "workspaces", "uiWorkspace", "conversation"];

    let isReverting = false;
    // 当前打开的原位内联编辑卡片（同时只允许一个）
    let activeEditCard = null;

    function injectStyles() {
      if (document.getElementById("dsh-revert-styles")) return;
      const style = document.createElement("style");
      style.id = "dsh-revert-styles";
      style.textContent = `
        .dsh-revert-icon-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center;
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
        .dsh-revert-edit-card {
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
          padding: 10px 12px !important;
          margin: 4px 0 !important;
          border: 1px solid var(--dsw-alias-brand-primary, #4d6bfe) !important;
          border-radius: var(--dsw-radius-lg, 12px) !important;
          background: var(--dsw-alias-bg-base, #fff) !important;
          box-sizing: border-box !important;
        }
        .dsh-revert-edit-textarea {
          width: 100% !important;
          min-height: calc(44px + var(--dsh-content-font-delta, 0px)) !important;
          max-height: 40vh !important;
          padding: 0 !important;
          border: none !important;
          outline: none !important;
          resize: none !important;
          background: transparent !important;
          color: var(--dsw-alias-label-primary) !important;
          font-family: inherit !important;
          font-size: calc(14px + var(--dsh-content-font-delta, 0px)) !important;
          line-height: 1.5 !important;
          overflow-y: auto !important;
          box-sizing: border-box !important;
        }
        .dsh-revert-edit-thumbs {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
        }
        .dsh-revert-edit-thumb {
          position: relative !important;
          width: 44px !important;
          height: 44px !important;
          border-radius: var(--dsw-radius-sm, 6px) !important;
          overflow: visible !important;
          flex: 0 0 auto !important;
        }
        .dsh-revert-edit-thumb img {
          width: 44px !important;
          height: 44px !important;
          object-fit: cover !important;
          border-radius: var(--dsw-radius-sm, 6px) !important;
          border: 1px solid var(--dsw-alias-border-l, rgba(0,0,0,0.08)) !important;
          display: block !important;
        }
        .dsh-revert-edit-thumb-remove {
          position: absolute !important;
          top: -6px !important;
          right: -6px !important;
          width: 16px !important;
          height: 16px !important;
          padding: 0 !important;
          border: none !important;
          border-radius: 50% !important;
          background: var(--dsw-alias-label-primary, #1f2329) !important;
          color: var(--dsw-alias-label-primary-inverted, #fff) !important;
          font-size: 10px !important;
          line-height: 1 !important;
          cursor: pointer !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .dsh-revert-edit-footer {
          display: flex !important;
          justify-content: flex-end !important;
          align-items: center !important;
          gap: 8px !important;
        }
        .dsh-revert-edit-cancel {
          padding: 6px 14px !important;
          border: 1px solid var(--dsw-alias-border-l, rgba(0,0,0,0.12)) !important;
          border-radius: var(--dsw-radius-sm, 6px) !important;
          background: transparent !important;
          color: var(--dsw-alias-label-secondary) !important;
          font-size: calc(13px + var(--dsh-content-font-delta, 0px)) !important;
          cursor: pointer !important;
          transition: background-color 0.15s ease !important;
        }
        .dsh-revert-edit-cancel:hover:not(:disabled) {
          background: var(--dsw-alias-interactive-bg-hover) !important;
        }
        .dsh-revert-edit-send {
          padding: 6px 16px !important;
          border: none !important;
          border-radius: var(--dsw-radius-sm, 6px) !important;
          background: var(--dsw-alias-button-primary-fill, #1f2329) !important;
          color: var(--dsw-alias-label-primary-inverted, #fff) !important;
          font-size: calc(13px + var(--dsh-content-font-delta, 0px)) !important;
          cursor: pointer !important;
          transition: opacity 0.15s ease !important;
        }
        .dsh-revert-edit-send:disabled,
        .dsh-revert-edit-cancel:disabled {
          opacity: 0.45 !important;
          cursor: not-allowed !important;
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

    // 定位消息行所属的对话轮次编号
    function resolveTurnNumber(row, chatSnapshot) {
      const turnSeatEl = row.closest("[data-chat-turn]");
      let currentTurnNum = Number(turnSeatEl?.dataset.chatTurn);

      if (!currentTurnNum || currentTurnNum <= 0) {
        const nodeKey = row.closest("[data-chat-node-key]")?.dataset.chatNodeKey;
        if (nodeKey) {
          currentTurnNum = getNodeTurn(chatSnapshot?.nodes?.get(nodeKey));
        }
      }

      return (currentTurnNum && !isNaN(currentTurnNum) && currentTurnNum > 0) ? currentTurnNum : undefined;
    }

    // 提取被撤回轮次的图片附件，并检测被撤回的轮次中是否包含工具调用
    async function extractTurnData(binding, chatSnapshot, currentTurnNum, safeTargetTurn) {
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

      return { extractedFiles, hasToolCallsInRevertedTurns };
    }

    // 真正执行回退：Fork/新建会话 + RPC 回滚文件 + 切换会话 + 回填（可选自动发送）
    async function executeRevertFlow(ctx, {
      sessionId,
      safeTargetTurn,
      atSeq: presetAtSeq,
      hasToolCallsInRevertedTurns,
      extractedFiles,
      promptText,
      autoSubmit = false,
    }) {
      if (isReverting) return;
      isReverting = true;

      try {
        const { sessions, uiConversation, workspaces, uiWorkspace, conversation } = ctx;

        const binding = sessions.binding(sessionId);
        const chatSnapshot = uiConversation.binding(sessionId).target("chat").getSnapshot();
        const summary = sessions.list.getSnapshot().byId[sessionId];

        // Turn 0 二次确认（在真正提交时才询问）
        if (safeTargetTurn === 0) {
          const confirmed = window.confirm(
            "⚠️ 警告：您正在撤销第 1 轮对话。\n\n" +
            "此操作将会【清空当前会话的全部历史消息】，并将工作区所有被修改的代码文件恢复到【最初始状态】。\n\n" +
            "是否确认彻底清空并回滚？"
          );
          if (!confirmed) return;
        }

        const atSeq = safeTargetTurn > 0 ? (presetAtSeq ?? getForkSeqForTurn(binding, chatSnapshot, safeTargetTurn)) : undefined;
        if (safeTargetTurn > 0 && (!atSeq || atSeq <= 0)) {
          console.error(`[dsh-revert] 未能定位目标轮次 #${safeTargetTurn} 的截断位置 (atSeq)，终止操作。`);
          window.alert(`⚠️ 未能定位第 ${safeTargetTurn} 轮的历史截断点 (atSeq)，已终止回退以保护当前会话与代码安全。`);
          return;
        }

        // 1. 解析所属工作区，创建或 Fork 新会话
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

        // 2. 触发后端文件恢复
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

        // 3. 切换至新会话并归档旧会话
        uiWorkspace.openSession(childId);
        if (sessionId !== childId) {
          workspaces.archiveSession(sessionId).catch(e => console.warn("[dsh-revert] archiveSession err:", e));
        }

        // 4. 回填子会话输入框草稿与图片附件
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

        // 5. 延迟回退模式：回填完成后自动发送
        if (autoSubmit) {
          const trySubmit = (attempt) => {
            try {
              const shell = conversation.input.shell(childId);
              const draftReady = !promptText || shell.snapshot?.draft === promptText;
              const phase = shell.snapshot?.phase;
              if (draftReady && attachmentsRestored && (phase === "plain" || phase === undefined)) {
                shell.submit();
                return;
              }
            } catch {}
            if (attempt < 12) setTimeout(() => trySubmit(attempt + 1), 120);
          };
          setTimeout(() => trySubmit(0), 520);
        }
      } catch (err) {
        console.error("[dsh-revert] Error during revert:", err);
      } finally {
        isReverting = false;
      }
    }

    // ============ 消息原位内联编辑卡片（Codex Desktop 风格） ============

    // 关闭当前打开的编辑卡片并还原消息显示；同一时间只允许一个卡片存在
    function closeInlineEditor() {
      const active = activeEditCard;
      if (!active) return;
      activeEditCard = null;
      if (active.cardEl.isConnected) active.cardEl.remove();
      if (active.rowEl) active.rowEl.style.display = "";
      for (const url of active.objectUrls) URL.revokeObjectURL(url);
    }

    // 点击 ↩️：在该条消息原位渲染内联编辑卡片（不触发任何回退）
    async function openInlineEditor(ctx, { row, promptText }) {
      if (isReverting) return;

      const { sessions, uiConversation, uiSession } = ctx;
      const sessionId = uiSession.adapter.current.getSnapshot()?.key;
      if (!sessionId) { console.error("[dsh-revert] No active session"); return; }

      const binding = sessions.binding(sessionId);
      const chatSnapshot = uiConversation.binding(sessionId).target("chat").getSnapshot();

      const currentTurnNum = resolveTurnNumber(row, chatSnapshot);
      if (!currentTurnNum) {
        console.error("[dsh-revert] 无法精确定位该消息所属的对话轮次编号，终止回退以保护代码安全。");
        window.alert("⚠️ 无法精确定位该消息所属的对话轮次编号，已阻止回退以保护代码安全。请刷新页面后重试。");
        return;
      }

      const safeTargetTurn = Math.max(0, currentTurnNum - 1);

      // 提前校验截断点，避免打开无法兑现的编辑卡片（turn 0 的清空确认推迟到 Send 时）
      const atSeq = safeTargetTurn > 0 ? getForkSeqForTurn(binding, chatSnapshot, safeTargetTurn) : undefined;
      if (safeTargetTurn > 0 && (!atSeq || atSeq <= 0)) {
        console.error(`[dsh-revert] 未能定位目标轮次 #${safeTargetTurn} 的截断位置 (atSeq)，终止操作。`);
        window.alert(`⚠️ 未能定位第 ${safeTargetTurn} 轮的历史截断点 (atSeq)，已终止回退以保护当前会话与代码安全。`);
        return;
      }

      // 提取该轮的图片附件与工具调用标记（异步）
      const { extractedFiles, hasToolCallsInRevertedTurns } = await extractTurnData(binding, chatSnapshot, currentTurnNum, safeTargetTurn);

      // 打开新卡片前自动关闭旧卡片（不触发回退）
      closeInlineEditor();

      // ---- 构建卡片 ----
      const keptFiles = [...extractedFiles];
      const objectUrls = [];

      const card = document.createElement("div");
      card.className = "dsh-revert-edit-card";

      const textarea = document.createElement("textarea");
      textarea.className = "dsh-revert-edit-textarea";
      textarea.value = promptText;
      textarea.rows = 1;
      const autoGrow = () => {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
      };
      textarea.addEventListener("input", () => { autoGrow(); syncSendState(); });
      card.appendChild(textarea);

      // 图片缩略图条（可单独移除）
      if (keptFiles.length > 0) {
        const thumbs = document.createElement("div");
        thumbs.className = "dsh-revert-edit-thumbs";
        keptFiles.forEach((file) => {
          const url = URL.createObjectURL(file);
          objectUrls.push(url);
          const wrap = document.createElement("div");
          wrap.className = "dsh-revert-edit-thumb";
          const img = document.createElement("img");
          img.src = url;
          img.alt = file.name;
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "dsh-revert-edit-thumb-remove";
          remove.textContent = "✕";
          remove.setAttribute("aria-label", "移除该图片");
          remove.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = keptFiles.indexOf(file);
            if (idx >= 0) keptFiles.splice(idx, 1);
            URL.revokeObjectURL(url);
            wrap.remove();
            syncSendState();
          };
          wrap.appendChild(img);
          wrap.appendChild(remove);
          thumbs.appendChild(wrap);
        });
        card.appendChild(thumbs);
      }

      // 底部按钮
      const footer = document.createElement("div");
      footer.className = "dsh-revert-edit-footer";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "dsh-revert-edit-cancel";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeInlineEditor();
      };

      const sendBtn = document.createElement("button");
      sendBtn.type = "button";
      sendBtn.className = "dsh-revert-edit-send";
      sendBtn.textContent = "Send";

      const syncSendState = () => {
        sendBtn.disabled = isReverting || (textarea.value.trim() === "" && keptFiles.length === 0);
      };

      const doSend = () => {
        if (sendBtn.disabled || isReverting) return;
        const editedText = textarea.value;
        if (editedText.trim() === "" && keptFiles.length === 0) return;

        // loading / 禁用态，防止重复点击
        sendBtn.disabled = true;
        cancelBtn.disabled = true;
        sendBtn.textContent = "Sending…";

        const filesToSend = [...keptFiles];
        closeInlineEditor();

        executeRevertFlow(ctx, {
          sessionId,
          safeTargetTurn,
          atSeq,
          hasToolCallsInRevertedTurns,
          extractedFiles: filesToSend,
          promptText: editedText,
          autoSubmit: true,
        });
      };

      sendBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        doSend();
      };

      footer.appendChild(cancelBtn);
      footer.appendChild(sendBtn);
      card.appendChild(footer);

      // Esc（焦点在卡片内时）取消编辑，不触发回退；Enter 直接发送（Shift+Enter 换行，输入法组合中不触发）
      card.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeInlineEditor();
        } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.target === textarea) {
          e.preventDefault();
          e.stopPropagation();
          doSend();
        }
      });

      // 原位替换：隐藏原消息行，卡片插在其位置（DOM 保留，取消时还原）
      row.style.display = "none";
      row.parentElement.insertBefore(card, row);

      activeEditCard = { rowEl: row, cardEl: card, objectUrls };

      syncSendState();
      autoGrow();
      // 聚焦并把光标移到文本末尾
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
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
        btn.setAttribute("aria-label", "编辑并重发此轮对话");
        btn.title = previewTurn > 0 ? `编辑并重发此轮 (撤回到第 ${previewTurn - 1} 轮)` : "编辑并重发此轮";
        btn.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5L2 7L5.5 10.5"/><path d="M2.5 7H9C11.5 7 13.5 9 13.5 11.5V12.5"/></svg>`;

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openInlineEditor(ctx, { row, promptText: getCleanText(bubble) });
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
      // HMR 重载后清理上一个实例：断开旧 observer、移除旧按钮与编辑卡片，避免点击旧按钮时使用已失活的 ctx
      if (typeof window.__dshRevertCleanup === "function") window.__dshRevertCleanup();
      const observer = new MutationObserver(() => attachUserRevertIcons(ctx));
      observer.observe(document.body, { childList: true, subtree: true });
      window.__dshRevertCleanup = () => {
        observer.disconnect();
        document.querySelectorAll(".dsh-revert-icon-btn, .dsh-revert-edit-card").forEach(el => {
          if (el.classList.contains("dsh-revert-edit-card") && el.nextElementSibling) el.nextElementSibling.style.display = "";
          el.remove();
        });
      };
      setTimeout(() => attachUserRevertIcons(ctx), 300);
    }

    return { name, inject, apply };
  },
});
