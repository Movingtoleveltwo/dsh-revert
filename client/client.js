window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: (require) => {
    const React = require("react");
    const ReactDOM = require("react-dom");
    const { useState, useEffect, createElement: h } = React;

    const name = "dsh-revert";
    const inject = ["slots", "locale", "connection"];

    // 样式注入：Codex 风格的用户气泡悬浮编辑按钮与弹窗
    function injectCodexStyles() {
      if (document.getElementById("dsh-revert-codex-style")) return;
      const style = document.createElement("style");
      style.id = "dsh-revert-codex-style";
      style.textContent = `
        .dsh-user-revert-btn {
          opacity: 0;
          transition: opacity 0.15s ease, transform 0.15s ease;
          cursor: pointer;
          background: rgba(40, 44, 52, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 6px;
          padding: 2px 8px;
          color: #cdd6f4;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          backdrop-filter: blur(4px);
          user-select: none;
          margin-right: 6px;
        }
        .dsh-user-revert-btn:hover {
          opacity: 1 !important;
          background: rgba(59, 130, 246, 0.9);
          border-color: rgba(96, 165, 250, 0.8);
          color: #fff;
          transform: scale(1.04);
        }
        /* 鼠标悬浮在你自己发送的消息气泡行时自动浮现编辑按钮 (Codex 体验) */
        div[data-chat-flow-kind="user"]:hover .dsh-user-revert-btn,
        div[data-time-hover-root]:hover .dsh-user-revert-btn,
        div[class*="userRow"]:hover .dsh-user-revert-btn {
          opacity: 0.85;
        }
      `;
      document.head.appendChild(style);
    }

    function RevertModal({ open, onClose, onConfirm, initialText, loading }) {
      if (!open) return null;
      const [promptText, setPromptText] = useState(initialText || "");
      const [restoreFiles, setRestoreFiles] = useState(true);

      useEffect(() => {
        setPromptText(initialText || "");
      }, [initialText]);

      return h("div", {
        style: {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.65)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999999,
          backdropFilter: "blur(6px)",
        }
      }, h("div", {
        style: {
          background: "#181825",
          color: "#cdd6f4",
          borderRadius: "14px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          padding: "22px",
          maxWidth: "520px",
          width: "92%",
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      }, [
        h("div", {
          key: "header",
          style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
        }, [
          h("h3", { key: "title", style: { margin: 0, fontSize: "16px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" } }, [
            h("span", { key: "icon" }, "✏️"),
            h("span", { key: "text" }, "编辑 Prompt 并重新生成 (Revert)")
          ]),
          h("button", {
            key: "close",
            onClick: onClose,
            style: { background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "18px", opacity: 0.7 }
          }, "✕")
        ]),
        h("p", {
          key: "desc",
          style: { margin: 0, fontSize: "13px", opacity: 0.8, lineHeight: 1.5 }
        }, "系统将截断后续生成记录，回到该轮对话状态。你可以直接微调 Prompt："),
        h("textarea", {
          key: "textarea",
          value: promptText,
          onChange: (e) => setPromptText(e.target.value),
          placeholder: "在此修改该轮的 Prompt...",
          rows: 5,
          style: {
            width: "100%",
            boxSizing: "border-box",
            background: "#11111b",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            borderRadius: "8px",
            color: "#fff",
            padding: "12px",
            fontSize: "14px",
            lineHeight: 1.5,
            resize: "vertical",
            outline: "none"
          }
        }),
        h("label", {
          key: "restore",
          style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }
        }, [
          h("input", {
            key: "cb",
            type: "checkbox",
            checked: restoreFiles,
            onChange: (e) => setRestoreFiles(e.target.checked)
          }),
          h("span", { key: "txt" }, "同步恢复代码文件（工作区 + 外部文件）至本轮快照")
        ]),
        h("div", {
          key: "actions",
          style: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }
        }, [
          h("button", {
            key: "cancel",
            onClick: onClose,
            disabled: loading,
            style: {
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: "13px"
            }
          }, "取消"),
          h("button", {
            key: "submit",
            disabled: loading,
            onClick: () => onConfirm({ prompt: promptText, restoreFiles }),
            style: {
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "13px",
              boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)"
            }
          }, loading ? "处理中..." : "确认并重新生成")
        ])
      ]));
    }

    let globalSetModalState = null;

    function GlobalRevertPortal() {
      const [modalState, setModalState] = useState({ open: false, initialText: "", loading: false });
      globalSetModalState = setModalState;

      const handleConfirm = async ({ prompt, restoreFiles }) => {
        setModalState((s) => ({ ...s, loading: true }));
        try {
          await fetch("/dsh-revert/rpc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "revert",
              payload: { restoreFiles }
            })
          }).catch(() => {});

          const composer = document.querySelector("textarea");
          if (composer && prompt) {
            composer.value = prompt;
            composer.dispatchEvent(new Event("input", { bubbles: true }));
            composer.focus();
          }

          setModalState({ open: false, initialText: "", loading: false });
        } catch (err) {
          alert("还原失败: " + err.message);
          setModalState((s) => ({ ...s, loading: false }));
        }
      };

      return h(RevertModal, {
        open: modalState.open,
        initialText: modalState.initialText,
        loading: modalState.loading,
        onClose: () => setModalState({ open: false, initialText: "", loading: false }),
        onConfirm: handleConfirm
      });
    }

    // 在你自己发送的用户气泡旁边挂载 Codex 风格编辑按钮
    function attachCodexUserBubbleButtons() {
      const userRows = document.querySelectorAll('div[data-chat-flow-kind="user"], div[data-time-hover-root], div[class*="userRow"]');
      userRows.forEach((row) => {
        if (row.querySelector('.dsh-user-revert-btn')) return;

        const bubble = row.querySelector('[class*="bubble"]');
        const actionsRow = row.querySelector('[class*="actions"]');
        if (!bubble && !actionsRow) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsh-user-revert-btn';
        btn.title = '编辑此轮 Prompt 并重新生成 (Codex 风格)';
        btn.innerHTML = '<span>✏️</span><span>编辑重试</span>';

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = bubble ? bubble.textContent.trim() : '';
          if (globalSetModalState) {
            globalSetModalState({ open: true, initialText: text, loading: false });
          }
        };

        if (actionsRow) {
          actionsRow.insertBefore(btn, actionsRow.firstChild);
        } else if (bubble) {
          bubble.parentElement.appendChild(btn);
        }
      });
    }

    function apply(ctx) {
      injectCodexStyles();

      // 挂载全局弹窗容器
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
        } catch (e) {
          console.warn("[dsh-revert] portal mount error:", e);
        }
      }

      // 启动 DOM 监听，动态为你发出的每一条用户消息气泡挂载编辑按钮
      const observer = new MutationObserver(() => {
        attachCodexUserBubbleButtons();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(attachCodexUserBubbleButtons, 500);
    }

    return { name, inject, apply };
  }
});
