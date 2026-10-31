# 区域剪藏验收

[English](README.md)

## 浏览器交互与内容

在 Ego Lite Chromium 的隔离页面中运行实际构建的弹窗和 `region-clip.js`。`serve-ui.mjs` 模拟浏览器扩展消息边界并记录保存内容，不连接真实实例或已安装插件。先执行 `bun run build:extension`，再执行 `bun docs/changes/evidence/2026-10-29-region-clip/serve-ui.mjs`，访问 `http://127.0.0.1:18703/` 可复现界面夹具。

- 悬停预览、点击锁定、左右键扩大与历史回退、上下键切换同级、Enter 保存和阻止网页链接激活均通过。取消后原链接处理器恢复，未创建笔记。
- 输出保留标题、链接、表格、代码空行及图片 URL，不含导航、导语、下一节、CSS/HTML 隐藏内容和输入框值，见 `browser-captures.json`。
- 重复启动只保留一个选择器；滚动后边框仍贴合选区，观察到边框 top 为 `-57.4844px`、元素 top 为 `-57.484375px`。
- 受控保存失败时保留区域并显示错误；挂起保存响应期间连续按 Enter，最终仅保存一次。区域移除或 URL 改变均未写入；悬停后替换 DOM，再点击会选中新的实际目标，不会保存旧元素。
- 390px 视口（`https://aihot.news/`）下，工具条 x=12–378、宽366、bottom=824，位于高844的视口内（本地夹具 375px 可用宽度下为 x=12–363、宽351、bottom=809），见 `selected-390px.png`；`https://aihot.news/` 上的桌面卡片选区及弹窗入口见 `selected-desktop.png`、`popup.png`。检查中修正了 Shadow DOM 内的平移和宽度计算。

## 源码与构建检查

- 实现前9项新检查失败：当时缺少新弹窗入口、内容转换及后台处理器。
- 最终受影响检查 **149项通过、0失败**，见 `affected-tests.txt`。包含真实后台 bundle 的创建笔记、图片上传与地址改写，HTTP 边界使用模拟响应；新增发送者/帧检查、表格与代码块不可分割缩小保护及启动时零写入检查通过。
- 首次全插件命令中505项通过，首个 React 弹窗检查超过既有5秒限制，后续两项出现未完成 `act()` 的状态交叠；单独执行弹窗文件9项通过，最终149项受影响检查也通过。其余未变化检查复用，不再重复运行全插件命令。
- `bun run typecheck`、`bun run typecheck:mobile`、`bun run build:web`、目标 oxlint、Chromium/Firefox 构建通过。Firefox lint 为0错误、0提示、10项打包依赖告警，见 `firefox-lint.txt`，包含新增独立 bundle 中 React DOM 的静态 innerHTML 告警，未屏蔽告警。

尚未完成安装到 Chrome/Edge/Firefox 后的运行验收及连接真实实例保存。源码仅在本地，未提交、推送、商店发布或部署。
