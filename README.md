# Three sidebar list modes

[简体中文](README.zh.md)

Click the **Workspaces** or **Sessions** heading (or its arrow) in the left sidebar
to cycle **All → Collapsed → Needs attention** (the sidebar starts in **Needs attention**).

- **Needs attention** keeps the current session, pinned sessions, sessions with pending approvals, plan reviews,
  questions, active turns/subagents, unread completions, or unsent drafts (when **Session draft** is enabled);
  idle conversations start collapsed and can be expanded 5 at a time with **Show more idle conversations**.
- **All** counts sessions matching the archive filter; **Collapsed** counts only sessions with activity or drafts;
  **Search** temporarily shows native results and restores your mode when closed.

Requires DeepSeek Harness `0.2.2-rc.5` or newer.
Enable **Three sidebar list modes** in **List Modular Improvement Plan**, or run `pnpm install` in this directory
and select it in **Plugins → Add plugin** (remove any standalone `@miorin/dsh-workspace-list-toggle` first;
never install both standalone and aggregate copies).

## Screenshots

**Needs attention** keeps the current session visible and lets you reveal more idle sessions (Chinese UI).

| | Light | Dark |
| --- | --- | --- |
| Needs attention view | ![Needs attention view with the current session and a button to reveal more idle sessions (light theme)](docs/assets/screenshots/main-light.png) | ![Needs attention view with the current session and a button to reveal more idle sessions (dark theme)](docs/assets/screenshots/main-dark.png) |

[Project documentation](docs/README.md)
