# 资源 MIME 浏览器验收

[English](README.md)

[`browser-results.json`](browser-results.json) 保存 Chromium 经真实 EdgeEver API 的检查结果，使用独立的本机回环地址及 SQLite/文件存储。内容均为合成数据，不含脚本或凭据。

- 历史图片、音频、视频记录中声明多个 MIME 类型时，响应统一为 `application/octet-stream` 附件。Chromium 对三者均发出成功的下载事件，没有将 HTML 内容解析为网页。
- 带引号参数的 UTF-16LE SVG 保留 charset 和参数内的逗号/分号，仍按 `image/svg+xml` 解析并带 sandbox CSP；SVG 文档中读到了预期的 `旧备份` 文字。
- 参数内带引号逗号的 PNG 仍按 `image/png` 解析，实际解码宽度为原始的一像素。

[API 回归](../../../../apps/api/src/resource-restore-security.test.mjs) 还覆盖三条 blob 路由、旧式/分片恢复拒绝、旧上传完成阶段、存储元数据、隐藏控制字符，以及入库元数据保持原样。运行 `bun test apps/api/src/resource-restore-security.test.mjs` 可重复这些检查。

浏览器检查未覆盖已部署的 Cloudflare/R2 实例或其他浏览器/原生引擎；Worker 打包单独检查。临时浏览器任务及样例服务在验收后关闭。
