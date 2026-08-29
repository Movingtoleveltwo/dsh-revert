window.__ModuleLoader__.load({
  id: "dsh-revert",
  factory: (require) => {
    const React = require("react");
    const { useState, useEffect, createElement: h } = React;

    const name = "dsh-revert";
    const inject = ["slots", "locale", "connection"];

    function RevertModal({ open, onClose, onConfirm, turnSeq, initialText, loading }) {
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
          background: "rgba(0, 0, 0, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 99999,
          backdropFilter: "blur(4px)",
        }
      }, h("div", {
        style: {
          background: "var(--dsh-bg-card, #1e1e2e)",
          color: "var(--dsh-fg, #cdd6f4)",
          borderRadius: "12px",
          border: "1px solid var(--dsh-border, rgba(255,255,255,0.1))",
          padding: "20px",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
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
          h("h3", { key: "title", style: { margin: 0, fontSize: "16px", fontWeight: "600" } }, "↩️ 还原至此轮对话 & 原地重试"),
          h("button", {
            key: "close",
            onClick: onClose,
            style: { background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "18px" }
          }, "✕")
        ]),
        h("p", {
          key: "desc",
          style: { margin: 0, fontSize: "13px", opacity: 0.8, lineHeight: 1.5 }
        }, "系统将截断后续生成记录，回到该轮对话状态。你可以在下方修改 Prompt 并重新生成："),
        h("textarea", {
          key: "textarea",
          value: promptText,
          onChange: (e) => setPromptText(e.target.value),
          placeholder: "修改此轮的 Prompt...",
          rows: 4,
          style: {
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "8px",
            color: "inherit",
            padding: "10px",
            fontSize: "14px",
            resize: "vertical",
            outline: "none"
          }
        }),
        h("label", {
          key: "restore",
          style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }
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
          style: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }
        }, [
          h("button", {
            key: "cancel",
            onClick: onClose,
            disabled: loading,
            style: {
              padding: "7px 14px",
              borderRadius: "6px",
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
              padding: "7px 16px",
              borderRadius: "6px",
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "13px"
            }
          }, loading ? "处理中..." : "确认还原并重新生成")
        ])
      ]));
    }

    function RevertActionButton({ messageId, ctx }) {
      const [modalOpen, setModalOpen] = useState(false);
      const [loading, setLoading] = useState(false);

      const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setModalOpen(true);
      };

      const handleConfirm = async ({ prompt, restoreFiles }) => {
        setLoading(true);
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

          setModalOpen(false);
        } catch (err) {
          alert("还原失败: " + err.message);
        } finally {
          setLoading(false);
        }
      };

      return h(React.Fragment, null, [
        h("button", {
          key: "btn",
          type: "button",
          title: "还原到此轮对话并重新生成 (Revert to here)",
          onClick: handleClick,
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            background: "none",
            border: "none",
            color: "inherit",
            opacity: 0.7,
            cursor: "pointer",
            padding: "3px 6px",
            borderRadius: "4px",
            fontSize: "12px",
            transition: "opacity 0.2s"
          },
          onMouseEnter: (e) => (e.currentTarget.style.opacity = "1"),
          onMouseLeave: (e) => (e.currentTarget.style.opacity = "0.7")
        }, [
          h("span", { key: "icon", style: { fontSize: "13px" } }, "↩️"),
          h("span", { key: "label" }, "还原重试")
        ]),
        h(RevertModal, {
          key: "modal",
          open: modalOpen,
          onClose: () => setModalOpen(false),
          onConfirm: handleConfirm,
          loading
        })
      ]);
    }

    function apply(ctx) {
      if (ctx.slots && typeof ctx.slots.register === "function") {
        try {
          ctx.slots.inject("conversation.chat.assistant-actions", () => {
            return ctx.slots.register({
              name: "conversation.chat.assistant-actions",
              id: "dsh-revert-action",
              order: 99
            }, (props) => h(RevertActionButton, { messageId: props.messageId, ctx }));
          });
        } catch (e) {
          console.warn("[dsh-revert] failed to inject slot:", e);
        }
      }
    }

    return { name, inject, apply };
  }
});
