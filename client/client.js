window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: (require) => {
    const React = require("react");
    const ReactDOM = require("react-dom");
    const { useState, createElement: h } = React;

    const name = "dsh-revert";
    const inject = ["slots", "locale", "connection", "sessions", "uiConversation", "uiSession"];

    let globalCtx = null;
    let globalSetModalState = null;
    let sessionsService = null;
    let uiConversationService = null;

    function injectStyles() {
      if (document.getElementById("dsh-revert-styles")) return;
      const style = document.createElement("style");
      style.id = "dsh-revert-styles";
      style.innerHTML = `
        .dsh-revert-icon-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          opacity: 0.5;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          color: var(--dsh-text-muted, #888);
        }
        .dsh-revert-icon-btn:hover {
          opacity: 1;
          background: var(--dsh-hover-bg, rgba(255,255,255,0.1));
          color: var(--dsh-text-primary, #fff);
        }
        .dsh-revert-icon-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; }
        .dsh-revert-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center;
          z-index: 999999;
          animation: dsh-fade-in 0.15s ease-out;
        }
        .dsh-revert-modal {
          background: var(--dsh-panel-bg, #1e1e1e);
          border: 1px solid var(--dsh-border-color, #333);
          border-radius: 8px; width: 360px; padding: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .dsh-revert-modal-title { font-size: 16px; font-weight: 600; color: #fff; margin: 0 0 12px 0; display: flex; align-items: center; justify-content: space-between; }
        .dsh-revert-modal-close { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; padding: 0; }
        .dsh-revert-modal-close:hover { color: #fff; }
        .dsh-revert-modal-body { font-size: 13px; color: #aaa; margin-bottom: 20px; line-height: 1.5; }
        .dsh-revert-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .dsh-revert-btn { padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; border: 1px solid transparent; }
        .dsh-revert-btn-cancel { background: transparent; color: #ccc; }
        .dsh-revert-btn-cancel:hover { background: rgba(255,255,255,0.05); }
        .dsh-revert-btn-confirm { background: #0066cc; color: #fff; border-color: #0077ff; display: flex; align-items: center; gap: 6px; }
        .dsh-revert-btn-confirm:hover { background: #0077ff; }
        .dsh-revert-btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
        @keyframes dsh-fade-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
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

    function AntigravityConfirmUndoModal({ open, onClose, onConfirm, hasCodeChanges, loading }) {
      if (!open) return null;
      return h('div', { className: 'dsh-revert-modal-overlay', onClick: onClose },
        h('div', { className: 'dsh-revert-modal', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'dsh-revert-modal-title' },
            "确认撤销",
            h('button', { className: 'dsh-revert-modal-close', onClick: onClose }, "×")
          ),
          h('div', { className: 'dsh-revert-modal-body' },
            "本次撤销将回滚相关代码与外部文件（若有）至当时状态，并彻底抹除该回合及后续所有对话记忆。此操作物理生效且不可逆，请确认是否继续？"
          ),
          h('div', { className: 'dsh-revert-modal-actions' },
            h('button', { className: 'dsh-revert-btn dsh-revert-btn-cancel', onClick: onClose, disabled: loading }, "取消"),
            h('button', { className: 'dsh-revert-btn dsh-revert-btn-confirm', onClick: onConfirm, disabled: loading }, 
              loading ? "回滚中..." : "确认 ↵"
            )
          )
        )
      );
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

    function GlobalRevertPortal() {
      const [modalState, setModalState] = useState({ open: false, initialText: "", targetTurn: null, targetFlowItem: null, hasCodeChanges: false, loading: false });
      globalSetModalState = setModalState;

      const handleConfirm = async () => {
        setModalState((s) => ({ ...s, loading: true }));
        try {
          const sessions = sessionsService || (globalCtx?.get ? globalCtx.get('sessions') : globalCtx?.sessions);
          const uiConversation = uiConversationService || (globalCtx?.get ? globalCtx.get('uiConversation') : globalCtx?.uiConversation);
          
          const sessionId = sessions?.list?.getSnapshot?.()?.current;
          if (!sessionId) throw new Error("No active session");
          const targetTurn = modalState.targetTurn;
          const promptText = modalState.initialText;
          const flowItem = modalState.targetFlowItem;

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

          // 瞬间关闭弹窗
          setModalState({ open: false, initialText: "", targetTurn: null, targetFlowItem: null, hasCodeChanges: false, loading: false });

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
          alert("撤销失败: " + err.message);
          setModalState((s) => ({ ...s, loading: false }));
        }
      };

      return h(AntigravityConfirmUndoModal, {
        open: modalState.open, hasCodeChanges: modalState.hasCodeChanges, loading: modalState.loading,
        onClose: () => { setModalState({ open: false, initialText: "", targetTurn: null, targetFlowItem: null, hasCodeChanges: false, loading: false }); },
        onConfirm: handleConfirm
      });
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
        btn.type = 'button'; btn.className = 'dsh-revert-icon-btn'; btn.setAttribute('aria-label', '撤销至此轮对话'); btn.title = '撤销至此轮 (Confirm Undo)';
        btn.innerHTML = `<svg viewBox="0 0 16 16" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5L2 7L5.5 10.5"/><path d="M2.5 7H9C11.5 7 13.5 9 13.5 11.5V12.5"/></svg>`;
        btn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          const text = bubble ? bubble.textContent.trim() : '';
          if (globalSetModalState) globalSetModalState({ open: true, initialText: text, targetTurn: turn, targetFlowItem: flowItem, hasCodeChanges: false, loading: false });
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
      
      injectStyles();
      let portalDiv = document.getElementById("dsh-revert-portal-root");
      if (!portalDiv) { portalDiv = document.createElement("div"); portalDiv.id = "dsh-revert-portal-root"; document.body.appendChild(portalDiv); }
      if (ReactDOM) {
        try {
          if (typeof ReactDOM.createRoot === "function") { const root = ReactDOM.createRoot(portalDiv); root.render(h(GlobalRevertPortal)); }
          else if (typeof ReactDOM.render === "function") { ReactDOM.render(h(GlobalRevertPortal), portalDiv); }
        } catch (e) {}
      }
      const observer = new MutationObserver(() => { attachUserRevertIcons(); });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(attachUserRevertIcons, 500);
    }

    return { name, inject, apply };
  }
});
