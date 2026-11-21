# 项目文档

[使用说明](../README.zh.md) · [开发约定](../AGENTS.local.md)

按钮通过 `sidebar.footer.action` 注册。隐藏状态由按钮提供，样式只匹配侧栏滚动区域里的原生列表正文。
工作区标题栏与列表正文由同一个原生组件渲染，样式依赖 DSH 的 `data-sidebar-scrollport` 和 `data-sidebar-list-area` 标记。
升级后检查这两个标记，并确认两次点击分别隐藏和恢复正文，搜索框仍然可用。
停用插件应立即移除按钮和样式。

本地检查运行 `npm run build`、`npm run check`，以及工作区的插件骨架检查。
