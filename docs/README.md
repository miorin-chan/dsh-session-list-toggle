# 项目文档

[使用说明](../README.zh.md) · [开发约定](../AGENTS.local.md)

按钮通过 `sidebar.footer.action` 注册，用 CSS 锚点贴在原生标题文字右边，键盘焦点顺序沿用底部槽位。
样式依赖 DSH 的 `data-sidebar-scrollport`、`data-sidebar-workspace-header` 和 `data-sidebar-list-area` 标记。
标题不存在或浏览器缺少锚点定位能力时，按钮隐藏，列表可见。
搜索框展开时，按钮随标题隐藏，列表临时显示以呈现结果。
升级后检查标题对齐、鼠标点击、搜索展开和关闭，以及列表显隐。
停用插件应立即移除按钮和样式。

本地检查运行 `npm run build`、`npm run check`，以及工作区的插件骨架检查。
