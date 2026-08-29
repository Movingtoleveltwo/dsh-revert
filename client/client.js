window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: (require) => {
    const React = require("react");
    const ReactDOM = require("react-dom");
    const { useState, useEffect, createElement: h } = React;

    const name = "dsh-revert";
    const inject = ["slots", "locale", "connection", "sessions", "uiConversation", "uiSession"];

    // 样式注入：1:1 复刻 Antigravity 确认撤销弹窗与图标
    function injectStyles() {
      if (document.getElementById("dsh-revert-agy-style")) return;
      const style = document.createElement("style");
      style.id = "dsh-revert-agy-style";
      style.textContent = `
        .dsh-revert-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: calc(28px + var(--dsh-content-font-delta, 0px));
          height: calc(28px + var(--dsh-content-font-delta, 0px));
          padding: 6px;
          border: none;
          border-radius: 28px;
          background: transparent;
          color: var(--dsw-alias-label-tertiary, #9399b2);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
          user-select: none;
          box-sizing: border-box;
        }
        .dsh-revert-icon-btn svg {
          width: calc(16px + var(--dsh-content-font-delta, 0px));
          height: calc(16px + var(--dsh-content-font-delta, 0px));
          stroke: currentColor;
          fill: none;
        }
        .dsh-revert-icon-btn:hover {
          background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
          color: var(--dsw-alias-label-secondary, #cdd6f4);
        }
      `;
      document.head.appendChild(style);
    }

    // 中文版 Antigravity 确认撤销对话框
    function AntigravityConfirmUndoModal({ open, onClose, onConfirm, hasCodeChanges, loading }) {
      if (!open) return null;

      useEffect(() => {
        const handleKeyDown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
      }, [onConfirm, onClose]);

      return h("div", {
        style: {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999999,
          backdropFilter: "blur(4px)",
        }
      }, h("div", {
        style: {
          background: "#16161a",
          color: "#e2e8f0",
          borderRadius: "10px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "20px 24px",
          maxWidth: "440px",
          width: "90%",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      }, [
        h("div", {
          key: "header",
          style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
        }, [
          h("h3", {
            key: "title",
            style: { margin: 0, fontSize: "16px", fontWeight: "600", color: "#f8fafc" }
          }, "确认撤销"),
          h("button", {
            key: "close",
            onClick: onClose,
            style: { background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "16px", padding: 0 }
          }, "✕")
        ]),
        h("p", {
          key: "desc",
          style: { margin: 0, fontSize: "14px", color: "#94a3b8", lineHeight: 1.5 }
        }, hasCodeChanges
          ? "本次撤销操作将还原该轮对话产生的所有代码变更。"
          : "本次撤销操作不会产生任何代码变更。"
        ),
        h("div", {
          key: "actions",
          style: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "14px", marginTop: "4px" }
        }, [
          h("button", {
            key: "cancel",
            onClick: onClose,
            disabled: loading,
            style: {
              background: "none",
              border: "none",
              color: "#cbd5e1",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              padding: "6px 10px"
            }
          }, "取消"),
          h("button", {
            key: "confirm",
            disabled: loading,
            onClick: onConfirm,
            style: {
              padding: "7px 18px",
              borderRadius: "6px",
              border: "none",
              background: "#0284c7",
              color: "#ffffff",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(2, 132, 199, 0.35)"
            }
          }, [
            h("span", { key: "txt" }, loading ? "正在撤销..." : "确认"),
            h("span", { key: "enter", style: { opacity: 0.7, fontSize: "12px" } }, "↵")
          ])
        ])
      ]));
    }

    let globalSetModalState = null;
    let globalCtx = null;

    // 清理已有内容并精确写入单份 Prompt 文本
    function fillComposerText(text) {
      if (!text) return;
      const editor = document.querySelector('[contenteditable="true"]') ||
                     document.querySelector('[data-lexical-editor="true"]') ||
                     document.querySelector('textarea');
      if (!editor) return;

      editor.focus();

      if (editor.tagName && editor.tagName.toLowerCase() === 'textarea') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        if (setter) setter.call(editor, text);
        else editor.value = text;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        editor.setSelectionRange(text.length, text.length);
      } else {
        // Lexical / contenteditable：先彻底选区清空
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("delete", false, null);

        // 插入单份新文本
        document.execCommand("insertText", false, text);

        if (editor.textContent.trim() !== text.trim()) {
          editor.textContent = text;
          editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
        }

        // 光标移至末尾
        const newRange = document.createRange();
        newRange.selectNodeContents(editor);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    }

    function GlobalRevertPortal() {
      const [modalState, setModalState] = useState({ open: false, initialText: "", targetSeq: null, targetElement: null, hasCodeChanges: false, loading: false });
      globalSetModalState = setModalState;

      const handleConfirm = async () => {
        setModalState((s) => ({ ...s, loading: true }));
        try {
          const sessionId = globalCtx?.sessions?.list?.getSnapshot?.()?.current;
          const targetSeq = modalState.targetSeq;
          const promptText = modalState.initialText;
          const targetEl = modalState.targetElement;

          // 1. 调用后端 RPC 进行快照与文件恢复
          await fetch("/dsh-revert/rpc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "revert",
              payload: { sessionId, atSeq: targetSeq, restoreFiles: true }
            })
          }).catch(() => {});

          // 2. 彻底隐藏本轮用户提问气泡及之后的所有回答气泡（从视觉上瞬间回退）
          if (targetEl) {
            const flowContainer = document.querySelector('[data-chat-flow]') || targetEl.closest('[class*="column"]');
            if (flowContainer) {
              let found = false;
              for (const child of Array.from(flowContainer.children)) {
                if (child === targetEl || child.contains(targetEl)) {
                  found = true;
                }
                if (found) {
                  child.style.display = "none";
                }
              }
            }
          }

          // 3. 尝试 DSH 底层 sessions.fork 切分支
          if (globalCtx?.sessions && sessionId && targetSeq !== null) {
            try {
              const forkAtSeq = Math.max(0, targetSeq - 1);
              const childId = await globalCtx.sessions.fork({
                sessionId,
                atSeq: forkAtSeq,
                increaseTitle: false
              });
              if (childId) {
                await globalCtx.sessions.open(childId);
              }
            } catch (forkErr) {
              console.warn("[dsh-revert] fork error:", forkErr);
            }
          }

          // 4. 精确回填单份 Prompt 到输入框
          setTimeout(() => {
            fillComposerText(promptText);
          }, 80);

          setModalState({ open: false, initialText: "", targetSeq: null, targetElement: null, hasCodeChanges: false, loading: false });
        } catch (err) {
          alert("撤销失败: " + err.message);
          setModalState((s) => ({ ...s, loading: false }));
        }
      };

      return h(AntigravityConfirmUndoModal, {
        open: modalState.open,
        hasCodeChanges: modalState.hasCodeChanges,
        loading: modalState.loading,
        onClose: () => setModalState({ open: false, initialText: "", targetSeq: null, targetElement: null, hasCodeChanges: false, loading: false }),
        onConfirm: handleConfirm
      });
    }

    // 在用户消息气泡下方的动作栏（时间与复制图标旁）挂载 ↩ 按钮
    function attachUserRevertIcons() {
      const userRows = document.querySelectorAll('div[data-chat-flow-kind="user"], div[class*="userRow"]');
      userRows.forEach((row) => {
        if (row.querySelector('.dsh-revert-icon-btn')) return;

        const actionsRow = row.querySelector('[class*="actions"]');
        const bubble = row.querySelector('[class*="bubble"]');
        if (!actionsRow && !bubble) return;

        // 获取该节点的 seq
        const anchorNode = row.closest('[data-chat-anchor-key]') || row;
        const anchorKey = anchorNode.getAttribute('data-chat-anchor-key') || '';
        const match = /^(\d+):/.exec(anchorKey);
        const seq = match ? Number(match[1]) : null;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsh-revert-icon-btn';
        btn.setAttribute('aria-label', '撤销至此轮对话');
        btn.title = '撤销至此轮 (Confirm Undo)';

        // 弧形回退箭头 SVG
        btn.innerHTML = `
          <svg viewBox="0 0 16 16" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5.5 3.5L2 7L5.5 10.5"/>
            <path d="M2.5 7H9C11.5 7 13.5 9 13.5 11.5V12.5"/>
          </svg>
        `;

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = bubble ? bubble.textContent.trim() : '';
          if (globalSetModalState) {
            globalSetModalState({
              open: true,
              initialText: text,
              targetSeq: seq,
              targetElement: row,
              hasCodeChanges: false,
              loading: false
            });
          }
        };

        if (actionsRow) {
          const copyBtn = actionsRow.querySelector('button');
          if (copyBtn && copyBtn.nextSibling) {
            actionsRow.insertBefore(btn, copyBtn.nextSibling);
          } else {
            actionsRow.appendChild(btn);
          }
        }
      });
    }

    function apply(ctx) {
      globalCtx = ctx;
      injectStyles();

      let portalDiv = document.getElementById("dsh-revert-portal-root");
      if (!portalDiv) {
        portalDiv = document.createElement("div");
        portalDiv.id = "dsh-revert-portal-root";
        document.body.appendChild(portalDiv);
      }

      if (ReactDOM) {
        try {
          if (typeof ReactDOM.createRoot === "function") {
            const root = ReactDOM.createRoot(portalDiv);
            root.render(h(GlobalRevertPortal));
          } else if (typeof ReactDOM.render === "function") {
            ReactDOM.render(h(GlobalRevertPortal), portalDiv);
          }
        } catch (e) {}
      }

      const observer = new MutationObserver(() => {
        attachUserRevertIcons();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(attachUserRevertIcons, 500);
    }

    return { name, inject, apply };
  }
});
