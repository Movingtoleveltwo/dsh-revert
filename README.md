# dsh-revert

[English](#english) | [简体中文](#简体中文)

---

<a name="english"></a>
## 🇬🇧 English

A modern UI-based rewind and retry plugin for DeepSeek Harness (DSH). Features inline prompt editing and a flawless dual-engine state recovery system (Workspace ShadowGit + External Tracker).

### ✨ Key Features
- 🎯 **Pure UI Interaction**: Hover over any chat message and click the "↩️ Rewind" button. No slash commands required.
- ✏️ **Inline Prompt Editing**: Automatically extracts and fills the prompt from the reverted turn into your composer.
- 🛡️ **Workspace Shadow Git**: Maintains lightweight, isolated snapshots of your workspace. Rolls back AI code changes in seconds **without polluting your own Git repository**.
- 🌐 **External File Interceptor**: Safely tracks and reverts files modified by the AI *outside* of the current workspace.
- 📱 **Fully Responsive**: Seamlessly adapts to Desktop, Tablet, and Mobile views.

### 🚀 Installation
**Method 1: Plugin Market**
Search for `dsh-revert` in DSH [Settings ➔ Plugin Market] and install it with one click.

**Method 2: Manual Link**
```bash
cd ~/.dsh/profiles/web
npm link /path/to/dsh-revert
```
Add `"dsh-revert"` to `dsh.profile.bundles` in your `package.json` and restart DSH.

---

<a name="简体中文"></a>
## 🇨🇳 简体中文

DeepSeek Harness (DSH) 现代化对话回退与重试插件：纯 UI 图形化交互、原地 Prompt 微调、支持工作区与外部文件双引擎安全快照恢复。

### ✨ 核心特性
- 🎯 **纯 UI 图形化交互**：无需记忆任何复杂的斜杠指令，鼠标悬浮在任意对话消息下方即可点击「↩️ 还原重试」；
- ✏️ **原地微调 Prompt**：弹窗直接回显该轮用户输入的 Prompt，修改后自动聚焦回填到聊天输入框；
- 🛡️ **工作区内快照（Shadow Git）**：在独立影子存储中维护轻量快照，秒级撤销代码变动，**绝不污染或重置用户自己的本地 Git 分支**；
- 🌐 **工作区外部安全恢复（External Interceptor）**：精准拦截 AI 在工作区外部编辑过的文件，并在回退时一并安全写回原始状态；
- 📱 **多端全适配**：电脑端、平板端与手机端界面完美适配。

### 🚀 安装与启用

**方式 1：通过插件市场一键安装**
在 DSH 的【设置 ➔ 插件市场】中搜索 `dsh-revert`，点击安装即可。

**方式 2：本地开发与手动加载**
```bash
# 进入 profile 目录并链接本地插件
cd ~/.dsh/profiles/web
npm link /path/to/dsh-revert
```
在 `~/.dsh/profiles/web/package.json` 中的 `dsh.profile.bundles` 添加 `"dsh-revert"`，重启 DSH 即可生效。

---

## 🛠️ 架构与技术原理 (Architecture)

1. **Client 端（Slot 注入）**：通过 DSH 的 Cordis 插槽系统注入 `conversation.chat.assistant-actions`，渲染回退操作按钮与 React 弹窗；
2. **Host 端（RPC 服务）**：通过 `/dsh-revert/rpc` 暴露轻量快照与回滚调度服务；
3. **快照存储引擎 (Storage Engines)**：
   - `ShadowGit`：按工作区路径哈希维护隔离的裸仓库快照 (Maintains isolated bare git repos for workspace snapshots)；
   - `ExternalFileTracker`：维护轮次级别的外部文件修改前置记录 (Tracks and restores external file states pre-modification)。

---

## 📄 开源协议 (License)

[MIT License](LICENSE) © 2026 Movingtoleveltwo
