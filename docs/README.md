# 项目文档

[使用说明](../README.zh.md) · [开发约定](../AGENTS.local.md)

按钮通过 `sidebar.footer.action` 注册，用 CSS 锚点贴在原生标题文字右边，键盘焦点顺序沿用底部槽位。
样式依赖 DSH 的 `data-sidebar-scrollport`、`data-sidebar-workspace-header` 和 `data-sidebar-list-area` 标记。
标题不存在或浏览器缺少锚点定位能力时，按钮隐藏，列表可见。
「需关注」从 `useSessions`、`useSessionStatus` 和 `useWorkspaces` 读取会话目录、
实时状态及工作区归属，并用子代理目录识别仍有子代理运行的父会话。
CSS 根据原生 `data-row-key` 筛选会话行和工作区标题。
工作区树折叠时若子工作区标题尚未渲染，插件使用已注册的目录祖先保留可见父级。
工作区展开、显示更多、菜单和导航仍由原生列表处理。
客户端把空闲会话开关放进原生滚动列表末尾，样式沿用原生组内「显示更多」的尺寸和主题色。
展开时，原生列表继续管理每组的显示行数。搜索期间暂停过滤并隐藏开关。
有归档记录时，插件只读原生视图偏好 `dsh.workspace.view.v5`，以在「仅显示归档」视图隐藏空闲会话开关。
升级后检查标题对齐、三态切换、折叠组标题、组内「显示更多」、搜索恢复，以及 Tab、Enter 和 Space。
停用插件应立即移除按钮和样式。

本地检查运行 `npm run build`、`npm run check`，以及工作区的插件骨架检查。
