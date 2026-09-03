window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: (require) => {
    const React = require("react");
    const ReactDOM = require("react-dom");

    const name = "dsh-revert";
    const inject = ["slots", "locale", "connection", "sessions", "uiConversation", "uiSession", "workspaces"];

    let globalCtx = null;
    let sessionsService = null;
    let uiConversationService = null;
    let workspacesService = null;
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

    function fillComposerText(text) {
      if (!text) return;
      const tryFill = (retries) => {
        const editorRoots = document.querySelectorAll('[contenteditable="true"]');
        let targetEditor = editorRoots[editorRoots.length - 1];
        if (targetEditor && targetEditor.offsetParent !== null) {
          targetEditor.focus();
          document.execCommand('insertText', false, text);
        } else if (retries > 0) {
          setTimeout(() => tryFill(retries - 1), 100);
        }
      };
      setTimeout(() => tryFill(15), 100);
    }

    function getForkSeqForTurn(globalCtx, sessionId, targetTurn, chatSnapshot) {
      if (targetTurn === 0 || targetTurn === null || targetTurn === undefined) return undefined;

      // 1. 优先从 DSH 官方 Chat 快照的 legacy.turnEnds 获取该轮次的精准结束 seq
      const endSeq = chatSnapshot?.legacy?.turnEnds?.get?.(targetTurn)
        || chatSnapshot?.timeline?.turns?.get?.(targetTurn)?.end?.seq;
      if (typeof endSeq === 'number' && endSeq > 0) {
        return endSeq;
      }

      // 2. 备用策略：从 chatSnapshot.nodes 中查找目标轮次的 turn-tail 节点
      if (chatSnapshot && chatSnapshot.nodes) {
        for (const node of chatSnapshot.nodes.values()) {
          const loc = node.location;
          if (loc && (loc.kind === 'turn' || loc.kind === 'step') && loc.turn.turn === targetTurn) {
            if (node.kind === 'turn-tail' || node.type === 'turn-tail') {
              const closingSeq = node.data?.closing?.finalNode?.seq ?? node.data?.seq ?? node.seq;
              if (typeof closingSeq === 'number' && closingSeq > 0) {
                return closingSeq;
              }
            }
          }
        }
      }

      return undefined;
    }

    async function executeDirectRevert({ targetTurn, promptText, flowItem }) {
      if (isReverting) return;
      isReverting = true;

      try {
        const sessions = sessionsService || (globalCtx?.get ? globalCtx.get('sessions') : globalCtx?.sessions);
        const uiConversation = uiConversationService || (globalCtx?.get ? globalCtx.get('uiConversation') : globalCtx?.uiConversation);
        
        const sessionId = sessions?.list?.getSnapshot?.()?.current;
        if (!sessionId) throw new Error("No active session");

        // 提取该轮回退的图片附件（如果有）
        const chatSnapshot = uiConversation?.binding(sessionId)?.target('chat')?.getSnapshot();
        const session = sessions?.binding?.(sessionId)?.session;
        const extractedFiles = [];
        const currentTurn = (targetTurn !== null && targetTurn !== undefined) ? targetTurn + 1 : null;
        
        try {
          if (chatSnapshot && chatSnapshot.nodes && session) {
            for (const node of chatSnapshot.nodes.values()) {
              const nodeTurn = node.location?.kind === 'turn' || node.location?.kind === 'step' ? node.location.turn?.turn : undefined;
              if (nodeTurn === currentTurn && (node.kind === 'user' || node.kind === 'steering' || node.type === 'user' || node.type === 'steering')) {
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

        const atSeq = getForkSeqForTurn(globalCtx, sessionId, targetTurn, chatSnapshot);
        const summary = sessions?.list?.getSnapshot?.()?.byId?.[sessionId];

        // 文件恢复（git 操作）在后台异步执行
        await fetch("/dsh-revert/rpc", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "rollback", payload: { sessionId, atSeq: atSeq === undefined ? null : atSeq, targetTurn, restoreFiles: true, cwd: summary?.cwd } })
        }).catch(e => console.error("[dsh-revert] RPC error:", e));

        let childId;
        if (targetTurn === 0) {
          childId = await sessions.create({
            workspaceId: summary?.workspaceId,
            cwd: summary?.cwd
          });
          sessions.open(childId);
        } else {
          childId = await sessions.fork({ sessionId, atSeq, increaseTitle: false });
          
          // 通知后端拷贝外部文件的快照数据到子会话
          await fetch("/dsh-revert/rpc", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "fork_session", payload: { oldSessionId: sessionId, newSessionId: childId } })
          }).catch(e => console.error("[dsh-revert] fork rpc error:", e));

          sessions.open(childId);
        }

        // 归档旧会话以避免侧边栏出现重复同名会话
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

        fillComposerText(promptText);

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
          setTimeout(() => tryDrop(15), 150);
        }
      } catch (err) {
        console.error("[dsh-revert] Error:", err);
      } finally {
        isReverting = false;
      }
    }

    function attachUserRevertIcons() {
      const userRows = document.querySelectorAll('div[data-chat-flow-kind="user"], div[class*="userRow"]');
      userRows.forEach((row) => {
        if (row.querySelector('.dsh-revert-icon-btn')) return;
        const actionsRow = row.querySelector('[class*="actions"]');
        const bubble = row.querySelector('[class*="bubble"]');
        if (!actionsRow && !bubble) return;
        const flowItem = row.closest('[data-chat-flow-key]') || row.closest('[class*="flowItem"]') || row;
        const allUserItems = Array.from(document.querySelectorAll('[data-chat-flow-kind="user"]'));
        const turnAttr = flowItem.getAttribute('data-chat-turn') || row.getAttribute('data-chat-turn');
        const userIndex = allUserItems.indexOf(flowItem);
        let turn = turnAttr !== null ? (Number(turnAttr) - 1) : (userIndex >= 0 ? userIndex : null);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsh-revert-icon-btn';
        btn.setAttribute('aria-label', '撤销至此轮对话');
        btn.title = '一键撤回至此轮';
        btn.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" style="fill: none !important; stroke: currentColor !important;"><path d="M5.5 3.5L2 7L5.5 10.5" fill="none" style="fill: none !important; stroke: currentColor !important;"/><path d="M2.5 7H9C11.5 7 13.5 9 13.5 11.5V12.5" fill="none" style="fill: none !important; stroke: currentColor !important;"/></svg>`;
        
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = bubble ? bubble.textContent.trim() : '';
          executeDirectRevert({ targetTurn: turn, promptText: text, flowItem });
        };

        if (actionsRow) {
          const copyBtn = actionsRow.querySelector('button');
          if (copyBtn && copyBtn.nextSibling) actionsRow.insertBefore(btn, copyBtn.nextSibling); else actionsRow.appendChild(btn);
        }
      });
    }

    function apply(ctx) {
      globalCtx = ctx;
      sessionsService = ctx.get ? ctx.get('sessions') : ctx.sessions;
      uiConversationService = ctx.get ? ctx.get('uiConversation') : ctx.uiConversation;
      workspacesService = ctx.get ? ctx.get('workspaces') : ctx.workspaces;
      
      injectStyles();
      const observer = new MutationObserver(() => { attachUserRevertIcons(); });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(attachUserRevertIcons, 500);
    }

    return { name, inject, apply };
  }
});
