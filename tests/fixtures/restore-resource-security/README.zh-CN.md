# 旧版备份恢复样例

[English](README.md)

`v2.12.0.zip` 由 `git archive v2.12.0 packages/shared` 提取的 `createEdgeEverZip` 生成，来源是官方正式版本的提交 `eeaab088f41d0417fbce2266f58ff4adde7f5d76`。旧版导出器在 Bun 下使用已安装的 lockfile 依赖直接运行，没有调用修复后的导出器。`source.json` 保存合成的输入数据及附件字节。

备份含一个笔记本、一篇置顶且带标签的笔记、一条历史版本，以及 PNG、无脚本的 SVG、MIME 为 null 的图片和可下载的 HTML 附件。MIME 为 null 的图片使用 `.bin` 文件名，避免按文件扩展名推断类型，实际覆盖既有二进制回退。不含凭据、用户数据、脚本或外部请求。安全回归测试分别通过旧式和分片 API 恢复这份固定备份，再读回数据及附件字节。

运行：`bun test apps/api/src/resource-restore-security.test.mjs`。
