window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: (require) => {
    const React = require("react");
    const ReactDOM = require("react-dom");
    const { useState, useEffect, createElement: h } = React;

    const name = "dsh-revert";
    const inject = ["slots", "locale", "connection"];

    // 样式注入：1:1 复刻 Antigravity Confirm Undo 弹窗与图标
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

    // 1:1 Antigravity Confirm Undo 对话框
    function AntigravityConfirmUndoModal({ open, onClose, onConfirm, hasCodeChanges, loading }) {
      if (!open) return null;

      // 键盘快捷键监听：Enter 确认，Escape 取消
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
          }, "Confirm Undo"),
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
          ? "This undo action will revert all code changes made in this turn."
          : "This undo action will not make any code changes."
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
          }, "Cancel"),
          h("button", {
            key: "confirm",
            disabled: loading,
            onClick: onConfirm,
            style: {
              padding: "7px 16px",
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
            h("span", { key: "txt" }, loading ? "Reverting..." : "Confirm"),
            h("span", { key: "enter", style: { opacity: 0.7, fontSize: "12px" } }, "↵")
          ])
        ])
      ]));
    }

    let globalSetModalState = null;

    function GlobalRevertPortal() {
      const [modalState, setModalState] = useState({ open: false, initialText: "", hasCodeChanges: false, loading: false });
      globalSetModalState = setModalState;

      const handleConfirm = async () => {
        setModalState((s) => ({ ...s, loading: true }));
        try {
          await fetch("/dsh-revert/rpc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "revert",
              payload: { restoreFiles: true }
            })
          }).catch(() => {});

          // 将 Prompt 自动回填到底部主输入框并获得焦点
          const composer = document.querySelector("textarea");
          if (composer && modalState.initialText) {
            composer.value = modalState.initialText;
            composer.dispatchEvent(new Event("input", { bubbles: true }));
            composer.focus();
          }

          setModalState({ open: false, initialText: "", hasCodeChanges: false, loading: false });
        } catch (err) {
          alert("Undo failed: " + err.message);
          setModalState((s) => ({ ...s, loading: false }));
        }
      };

      return h(AntigravityConfirmUndoModal, {
        open: modalState.open,
        hasCodeChanges: modalState.hasCodeChanges,
        loading: modalState.loading,
        onClose: () => setModalState({ open: false, initialText: "", hasCodeChanges: false, loading: false }),
        onConfirm: handleConfirm
      });
    }

    // 1:1 在用户消息气泡下方的动作栏（时间与复制图标旁）添加纯图标 ↩ 按钮
    function attachUserRevertIcons() {
      const userRows = document.querySelectorAll('div[data-chat-flow-kind="user"], div[class*="userRow"]');
      userRows.forEach((row) => {
        if (row.querySelector('.dsh-revert-icon-btn')) return;

        const actionsRow = row.querySelector('[class*="actions"]');
        const bubble = row.querySelector('[class*="bubble"]');
        if (!actionsRow && !bubble) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsh-revert-icon-btn';
        btn.setAttribute('aria-label', 'Undo to this message');
        btn.title = 'Undo / Revert (Confirm Undo)';

        // 1:1 弧形回退箭头 SVG
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
            globalSetModalState({ open: true, initialText: text, hasCodeChanges: false, loading: false });
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
