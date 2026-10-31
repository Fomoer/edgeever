# 分享选项：自定义密码、更新时间与品牌

[English](2026-10-30-share-options.md) · [Issue #714](https://github.com/tianma-if/edgeever/issues/714)

## 问题与目标

完成 #714 剩余分享选项及 [PR #735 的展示要求](https://github.com/tianma-if/edgeever/pull/735#issuecomment-6521859852)：分享者可以自行设置访问密码，并独立控制公开页的最后更新时间和 EdgeEver 品牌。两个展示设置均默认开启，包括已有分享。二维码 PNG/SVG 下载已经发布，不属于本次改动。

## 允许变更与验收

1. **自定义密码。** 扩展现有单笔记分享 PATCH 契约，在保留自动生成密码流程的同时允许密码保护分享接收显式密码。保留只发送 `passwordProtected` 的旧客户端、哈希/静态加密、解锁限流、Cookie 失效和密码返回行为。显式密码先去除首尾空白，长度必须为4–64个字符；空值、过短、过长或只含空白的输入拒绝且不修改分享。对话框提供自动生成/自定义两种模式，自定义输入只在编辑/创建期间显示，并保留现有管理端密码读取、重新生成和复制行为。保留 `passwordProtected: false` 的关闭语义，不因随附有效密码增加组合拒绝条件。保存期间禁用自定义密码输入，失败时保留输入和原分享状态、显示现有错误，不产生未处理的 Promise。测试 API 兼容、校验、哈希、替换、旧客户端以及保存失败/处理中状态。
2. **独立展示设置。** 将 API/UI 的单一 `showDetails` 字段替换为 `showUpdatedAt` 和 `showBranding`，分别持久化。新分享和已有分享均默认开启；客户端将缺省字段视为开启。修改其中一个不改变另一个或密码。移除 EdgeEver/只读分享页头标识；启用时在标题附近显示最后更新时间，品牌以小号、弱化、普通文档流中的页脚链接展示“使用 EdgeEver 发布”，指向 `https://edgeever.org/`，不使用悬浮或吸附徽章。独立公开页的 HTML 后备展示与客户端均遵守设置；笔记本分享展示、正文、标题/元数据、Markdown 接口、资源、密码门禁和 slug/token 不变。覆盖四种组合、持久化读回和旧行默认值。
3. 更新共享 schema/类型、API 行映射、客户端、Web/桌面分享对话框和涉及的全部语言目录。复用现有分享组件和 API 错误模式，不增加重复开关说明。新增 `0083_memo_share_presentation.sql`，增加两个 `NOT NULL DEFAULT 1` 字段。保留 migration 0082 及不再使用的 `show_details` 字段，支持已迁移数据库和应用代码回退。
4. 将上游 main 合入 PR 分支，包含其已有字体回归测试修正，不另改字体行为。通过 PR 的 Ubuntu Test 和容器构建工作流验证合并结果。

验收：先编写针对性展示测试，再实现；在隔离本地实例实际操作对话框和公开页。覆盖四种开关组合、重新打开后的持久化、旧分享迁移/默认值、密码保护展示及笔记本原展示。复用仍有效的密码验收，重跑变化的 API/shared/Web 路径，以及 `bun run typecheck`、`bun run typecheck:mobile`、`bun run build:web`。使用 SQLite 验证旧路由/schema → migration 0082/0083 → 新路由 → 旧路由回退。记录真实失败及未验证的原生/生产路径。

## 边界与风险

不改二维码下载、笔记本分享、认证设计、备份/同步、无关分享重构、发版/版本号/部署，也不删除用户数据。

最坏后果是密码更新导致分享无法解锁，或公开页错误隐藏元数据/内容。回退是撤回应用代码并保留追加字段。migration 和旧客户端行为需要明确验证。真实 Cloudflare/Docker 生产及已安装桌面端验收不在本地变更范围，除非另行要求。

## 完成核对

自定义密码和两个独立展示设置均已实现。当前契约使用 `showUpdatedAt` 和 `showBranding`；migration 0083 将两项默认设为开启。旧页头标识已移除，可选品牌以普通文档流页脚展示。笔记本分享行为、二维码下载和部署配置保持不变。

- 81 项针对性 API、公开 HTML、笔记本、shared、对话框和菜单测试通过，覆盖四种组合和旧行默认值。语言目录测试 5 项、上游已修正的字体测试 6 项通过。类型检查、Web 构建、lint 和 diff 检查通过，见[验证结果](evidence/2026-10-30-share-options/validation.json)和[针对性测试](evidence/2026-10-30-share-options/share-tests.txt)。
- [浏览器验收](evidence/2026-10-30-share-options/presentation-browser.json)覆盖两个开关、四种实际页面组合、重新打开后的持久化和密码保护展示。截图：[开关](evidence/2026-10-30-share-options/presentation-controls.png)、[全部显示](evidence/2026-10-30-share-options/presentation-both.png)、[仅时间](evidence/2026-10-30-share-options/presentation-time.png)、[仅品牌](evidence/2026-10-30-share-options/presentation-branding.png)、[全部隐藏](evidence/2026-10-30-share-options/presentation-hidden.png)。此前[密码失败/处理中检查](evidence/2026-10-30-share-options/password-controls-regression.json)仍适用于未改动的密码控件。
- [跨版本验收](evidence/2026-10-30-share-options/cross-version.mjs)覆盖基线 `e052ac3b` 分享路由/schema → SQLite migration 0082/0083 → 新路由 → 旧路由读取和更新。结果验证旧行保留、升级后旧解锁有效、换密码使旧密码/Cookie 对正文和附件失效。使用测试对象存储，属于 API/数据库兼容验证，不是已安装应用升级测试。
- 已合入上游 main 及其字体测试修正。完整 Ubuntu Test 和容器构建结果见 [PR #735 检查](https://github.com/tianma-if/edgeever/pull/735/checks)。

未验证已安装原生桌面端及真实 Cloudflare/Docker 生产环境；没有移动端功能变更。部署时先应用 migration 0082 和 0083，再部署应用。回退可保留新增字段并撤回应用代码；旧分享路由读取和更新已验证。没有引入清单外行为变化。
