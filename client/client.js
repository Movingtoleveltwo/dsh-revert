window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: (require) => {
    const React = require("react");
    const ReactDOM = require("react-dom");

    const name = "dsh-revert";
    const inject = ["slots", "locale", "connection", "sessions", "uiConversation", "uiSession", "workspaces", "uiWorkspace", "conversation"];

    let globalCtx = null;
    let sessionsService = null;
    let uiConversationService = null;
    let workspacesService = null;
    let uiWorkspaceService = null;
    let conversationService = null;
    let isReverting = false;

    function injectStyles() {
      if (document.getElementById("dsh-revert-styles")) return;
      const style = document.createElement("style");
      style.id = "dsh-revert-styles";
      style.innerHTML = `
        .dsh-revert-icon-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: calc(28px + var(--dsh-content-font-delta, 0px)) !important;
          height: calc(28px + var(--dsh-content-font-delta, 0px)) !important;
          padding: 6px !important;
          border: none !important;
          border-radius: 28px !important;
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
      if (!bubble) return '';
      const clone = bubble.cloneNode(true);
      clone.querySelectorAll('.dsh-revert-icon-btn').forEach(el => el.remove());
      return clone.textContent.trim();
    }

    // 精准查找目标保留轮次 (targetTurnToKeep) 的 turn/end 结束 event.seq
    function getForkSeqForTurn(globalCtx, sessionsService, sessionId, targetTurn, chatSnapshot) {
      if (targetTurn <= 0 || targetTurn === null || targetTurn === undefined) return undefined;

      // 1. 从 Sessions Binding 的原始 EventSource 中寻找目标轮次 targetTurn 的 turn/end 事件 seq
      try {
        const sessions = sessionsService || (globalCtx?.get ? globalCtx.get('sessions') : globalCtx?.sessions);
        const binding = sessions?.binding?.(sessionId);
        const window = binding?.eventSource?.getSnapshot?.();
        const entries = window?.entries || [];

        let turnCount = 0;
        for (const entry of entries) {
          const ev = entry.event || entry;
          if (ev && ev.type === 'turn/end') {
            turnCount++;
            const turnNum = ev.data?.turn ?? turnCount;
            if (turnNum === targetTurn || turnCount === targetTurn) {
              if (typeof ev.seq === 'number' && ev.seq > 0) {
                return ev.seq;
              }
            }
          }
        }
      } catch (e) {
        console.warn('[dsh-revert] EventSource lookup error:', e);
      }

      // 2. 从 DSH 官方 Chat 快照的 legacy.turnEnds 读取该轮次的精准结束 seq
      try {
        const legacyEnds = chatSnapshot?.legacy?.turnEnds;
        const endSeq = (typeof legacyEnds?.get === 'function' ? legacyEnds.get(targetTurn) : legacyEnds?.[targetTurn])
          || chatSnapshot?.timeline?.turns?.get?.(targetTurn)?.end?.seq;
        if (typeof endSeq === 'number' && endSeq > 0) {
          return endSeq;
        }
      } catch (e) {
        console.warn('[dsh-revert] legacyEnds lookup error:', e);
      }

      // 3. 从 chatSnapshot.nodes 中查找目标轮次的 turn-tail 节点
      if (chatSnapshot && chatSnapshot.nodes) {
        try {
          const nodesList = typeof chatSnapshot.nodes.values === 'function' ? Array.from(chatSnapshot.nodes.values()) : (chatSnapshot.nodes || []);
          for (const node of nodesList) {
            const loc = node.location;
            const nodeTurn = (loc?.kind === 'turn' || loc?.kind === 'step') ? loc.turn?.turn : undefined;
            if (nodeTurn === targetTurn && (node.kind === 'turn-tail' || node.type === 'turn-tail')) {
              const closingSeq = node.data?.closing?.finalNode?.seq ?? node.data?.seq ?? node.seq ?? node.anchorSeq;
              if (typeof closingSeq === 'number' && closingSeq > 0) {
                return closingSeq;
              }
            }
          }
        } catch (e) {
          console.warn('[dsh-revert] nodes turn-tail lookup error:', e);
        }
      }

      return undefined;
    }

    async function executeDirectRevert({ targetTurnToKeep, promptText, flowItem }) {
      if (isReverting) return;
      isReverting = true;

      try {
        const sessions = sessionsService || (globalCtx?.get ? globalCtx.get('sessions') : globalCtx?.sessions);
        const uiConversation = uiConversationService || (globalCtx?.get ? globalCtx.get('uiConversation') : globalCtx?.uiConversation);
        const uiWorkspace = uiWorkspaceService || (globalCtx?.get ? globalCtx.get('uiWorkspace') : globalCtx?.uiWorkspace);
        
        const sessionId = sessions?.list?.getSnapshot?.()?.current;
        if (!sessionId) throw new Error("No active session");

        const chatSnapshot = uiConversation?.binding(sessionId)?.target('chat')?.getSnapshot();
        const session = sessions?.binding?.(sessionId)?.session;
        const summary = sessions?.list?.getSnapshot?.()?.byId?.[sessionId];

        const safeTargetTurn = (targetTurnToKeep === null || targetTurnToKeep === undefined || isNaN(targetTurnToKeep)) ? 0 : targetTurnToKeep;
        
        // 当 safeTargetTurn > 0 时，寻找 targetTurnToKeep 的 turn/end 结束 seq 作为 atSeq
        const atSeq = safeTargetTurn > 0 ? getForkSeqForTurn(globalCtx, sessions, sessionId, safeTargetTurn, chatSnapshot) : undefined;

        // 提取被撤回轮次（targetTurnToKeep + 1）的图片附件（如果有）
        const extractedFiles = [];
        const currentTurnToRevert = safeTargetTurn + 1;
        try {
          if (chatSnapshot && chatSnapshot.nodes && session) {
            const nodesList = typeof chatSnapshot.nodes.values === 'function' ? Array.from(chatSnapshot.nodes.values()) : (chatSnapshot.nodes || []);
            for (const node of nodesList) {
              const nodeTurn = node.location?.kind === 'turn' || node.location?.kind === 'step' ? node.location.turn?.turn : undefined;
              if (nodeTurn === currentTurnToRevert && (node.kind === 'user' || node.kind === 'steering' || node.type === 'user' || node.type === 'steering')) {
                const contentBlocks = node.data?.content || [];
                let imgIndex = 1;
                for (const block of contentBlocks) {
                  if (block.type === 'image' && block.attachment) {
                    try {
                      const att = block.attachment;
                      if (typeof session.readAttachment === 'function') {
                        const res = await session.readAttachment(att.attachmentId);
                        if (res && res.ok && res.value?.data) {
                          const mediaType = att.mediaType || res.value.attachment?.mediaType || 'image/png';
                          const blob = new Blob([res.value.data], { type: mediaType });
                          const file = new File([blob], `image-${imgIndex++}.png`, { type: mediaType });
                          extractedFiles.push(file);
                        }
                      }
                    } catch (e) {
                      console.warn("[dsh-revert] extract attachment err:", e);
                    }
                  }
                }
              }
            }
          }
        } catch(e) { console.warn("[dsh-revert] attachment parsing err:", e); }

        // 文件恢复（git 操作）在后台异步执行
        fetch("/dsh-revert/rpc", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "rollback", payload: { sessionId, atSeq: (atSeq === undefined || atSeq <= 0) ? null : atSeq, targetTurn: safeTargetTurn, restoreFiles: true, cwd: summary?.cwd } })
        }).catch(e => console.error("[dsh-revert] RPC error:", e));

        let childId;
        if (safeTargetTurn === 0 || atSeq === undefined) {
          // 撤回第 1 轮消息（保留 0 轮历史）：创建一个全新的干净会话
          childId = await sessions.create({
            workspaceId: summary?.workspaceId,
            cwd: summary?.cwd
          });
        } else {
          // 撤回第 N 轮消息（保留 N-1 轮历史）：Fork 在 targetTurnToKeep 的 turn/end 处精确截断
          childId = await sessions.fork({ sessionId, atSeq, increaseTitle: false });
          
          fetch("/dsh-revert/rpc", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "fork_session", payload: { oldSessionId: sessionId, newSessionId: childId } })
          }).catch(e => console.error("[dsh-revert] fork rpc error:", e));
        }

        // 导航与页面切换
        const doOpenSession = () => {
          try {
            if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
              uiWorkspace.openSession(childId);
            } else if (sessions && typeof sessions.open === 'function') {
              sessions.open(childId);
            }
          } catch (e) {
            console.warn('[dsh-revert] openSession try failed:', e);
          }
        };

        doOpenSession();
        setTimeout(doOpenSession, 60);

        // 归档旧会话以避免侧边栏重复
        if (sessionId && sessionId !== childId) {
          try {
            const ws = workspacesService || (globalCtx?.get ? globalCtx.get('workspaces') : globalCtx?.workspaces);
            if (ws && typeof ws.archiveSession === 'function') {
              ws.archiveSession(sessionId).catch((err) => {
                console.warn('[dsh-revert] 归档旧会话失败:', err);
              });
            }
          } catch (err) {
            console.warn('[dsh-revert] 归档旧会话异常:', err);
          }
        }

        // 设置新会话的输入框草稿
        if (promptText) {
          const applyDraft = () => {
            let ok = false;
            try {
              const conv = conversationService || (globalCtx?.get ? globalCtx.get('conversation') : globalCtx?.conversation);
              if (conv && conv.input && typeof conv.input.shell === 'function') {
                const shell = conv.input.shell(childId);
                if (shell && typeof shell.setDraft === 'function') {
                  shell.setDraft(promptText);
                  ok = true;
                }
              }
            } catch (e) {}
            try {
              const binding = uiConversation?.binding?.(childId);
              if (binding && typeof binding.setDraft === 'function') {
                binding.setDraft(promptText);
                ok = true;
              }
            } catch (e) {}
            return ok;
          };

          applyDraft();
          setTimeout(applyDraft, 100);
          setTimeout(applyDraft, 300);
        }

        // 回填图片附件
        if (extractedFiles.length > 0) {
          const tryDrop = (retries) => {
            const editorRoots = document.querySelectorAll('[contenteditable="true"]');
            const targetEditor = editorRoots[editorRoots.length - 1];
            if (targetEditor && targetEditor.offsetParent !== null) {
              try {
                const dt = new DataTransfer();
                extractedFiles.forEach(f => dt.items.add(f));
                const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
                document.dispatchEvent(dropEvent);
              } catch(e) {
                console.warn("[dsh-revert] drop event err:", e);
              }
            } else if (retries > 0) {
              setTimeout(() => tryDrop(retries - 1), 100);
            }
          };
          setTimeout(() => tryDrop(15), 300);
        }
      } catch (err) {
        console.error("[dsh-revert] Error during revert:", err);
      } finally {
        isReverting = false;
      }
    }

    function attachUserRevertIcons() {
      const userRows = document.querySelectorAll('div[data-chat-flow-kind="user"], div[data-chat-flow-kind="steering"], div[class*="userRow"]');
      userRows.forEach((row) => {
        if (row.querySelector('.dsh-revert-icon-btn')) return;
        const actionsRow = row.querySelector('[class*="actions"]');
        const bubble = row.querySelector('[class*="bubble"]');
        if (!actionsRow && !bubble) return;
        const flowItem = row.closest('[data-chat-flow-key]') || row.closest('[class*="flowItem"]') || row;
        const allUserItems = Array.from(document.querySelectorAll('div[data-chat-flow-kind="user"], div[data-chat-flow-kind="steering"]'));
        const turnAttr = flowItem.getAttribute('data-chat-turn') || row.getAttribute('data-chat-turn');
        const userIndex = allUserItems.indexOf(flowItem);
        
        let currentTurnNum = null;
        if (turnAttr !== null && turnAttr !== undefined && turnAttr !== '') {
          currentTurnNum = Number(turnAttr);
        } else if (userIndex >= 0) {
          currentTurnNum = userIndex + 1;
        }

        // 计算需要保留的历史轮次（目标消息之前的轮次）
        let targetTurnToKeep = (currentTurnNum !== null && !isNaN(currentTurnNum)) ? (currentTurnNum - 1) : 0;
        if (targetTurnToKeep < 0) targetTurnToKeep = 0;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsh-revert-icon-btn';
        btn.setAttribute('aria-label', '撤销至此轮对话');
        btn.title = '一键撤回至此轮';
        btn.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" style="fill: none !important; stroke: currentColor !important;"><path d="M5.5 3.5L2 7L5.5 10.5" fill="none" style="fill: none !important; stroke: currentColor !important;"/><path d="M2.5 7H9C11.5 7 13.5 9 13.5 11.5V12.5" fill="none" style="fill: none !important; stroke: currentColor !important;"/></svg>`;
        
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = getCleanText(bubble);
          executeDirectRevert({ targetTurnToKeep, promptText: text, flowItem });
        };

        if (actionsRow) {
          const copyBtn = actionsRow.querySelector('button');
          if (copyBtn && copyBtn.nextSibling) actionsRow.insertBefore(btn, copyBtn.nextSibling); else actionsRow.appendChild(btn);
        } else if (bubble) {
          bubble.appendChild(btn);
        }
      });
    }

    function apply(ctx) {
      globalCtx = ctx;
      sessionsService = ctx.get ? ctx.get('sessions') : ctx.sessions;
      uiConversationService = ctx.get ? ctx.get('uiConversation') : ctx.uiConversation;
      workspacesService = ctx.get ? ctx.get('workspaces') : ctx.workspaces;
      uiWorkspaceService = ctx.get ? ctx.get('uiWorkspace') : ctx.uiWorkspace;
      conversationService = ctx.get ? ctx.get('conversation') : ctx.conversation;
      
      injectStyles();
      const observer = new MutationObserver(() => { attachUserRevertIcons(); });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(attachUserRevertIcons, 500);
    }

    return { name, inject, apply };
  }
});