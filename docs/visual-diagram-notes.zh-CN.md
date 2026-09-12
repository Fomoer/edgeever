# 可视化图表笔记设计说明

本文记录 EdgeEver 可视化图表笔记（思维导图、流程图、架构图）的技术选型与方案决策，供后续开发、评审和跨端适配参考。

## IR 是什么

IR（Intermediate Representation，中间表示）是图表的结构化事实来源，位于“用户编辑操作”和“具体渲染引擎”之间。它保存节点、连线、坐标、尺寸和语义，但不绑定 X6、Mermaid 或某个平台 UI。

```text
用户操作 → Diagram IR → X6 / Mermaid / 导出器
```

这层抽象带来三个直接收益：

- 同一份图表可以在不同端由不同引擎渲染。
- 更换外观、布局或渲染库时，不需要迁移笔记的业务含义。
- 数据可以先验证再渲染，避免悬空连线、非法父子关系和错误节点类型进入编辑器。

持久化文档用 `schemaVersion` 区分格式：思维导图和流程图为 `1`，架构图为 `2`，后者增加语义组件、系统边界、连线类型和双向关系。Markdown 信封注释名始终是 `edgeever-diagram-v1`，不随 `schemaVersion` 改名。

MCP 与编译路径另有一层不含坐标的语义图；服务端再生成尺寸、坐标和连线标识，写入持久化文档。Agent 协议不携带 X6 或画布状态。

## IR 与绘图引擎解耦

IR 的核心价值之一，是让 EdgeEver 保留对底层绘图引擎的选择权。IR 负责回答“这张图表达什么”，适配器负责回答“当前引擎如何把它画出来”：

```text
                   ┌→ X6 Adapter → Web / 桌面交互编辑；自有客户端阅读与公开分享
Diagram IR ────────┼→ Mermaid Adapter → 可移植信封、富文本嵌入图表、IR 解析失败时的降级
                   ├→ Export Adapter → SVG / PNG
                   └→ MCP Tools → AI 读取与修改
```

这种解耦并不代表不同引擎之间不存在差异。节点坐标、尺寸、容器关系和连线方向仍具有布局含义，各渲染器也可能支持不同能力，因此需要明确的适配层。目标是隔离差异，而不是假设所有引擎完全等价。

IR 中应保存稳定的业务语义和必要布局，例如“这是数据库”“它位于后端边界中”“服务通过数据连接访问它”。X6 的 SVG Path、内部事件、视图实例、临时选择状态等引擎细节不应进入 IR，否则只是把强耦合转移到了持久化格式中。

## 当前数据模型

持久化 IR 是 `DiagramDocument`，包含 `schemaVersion`、`kind`（`mind-map` / `flowchart` / `architecture`）、可选 `theme`，思维导图还可带 `structure`。节点包含 `id`、`label`、`x`、`y`、`width`、`height`、`shape`；可选 `parentId`（思维导图的主题层级，或架构图中位于系统边界内）和 `resourceIcon`（架构图资源外观）。连线包含必填的 `id`、`source`、`target`，并可携带 `label`、`kind` 和 `bidirectional`。

图表保存为一份可移植 Markdown：正文包含 Mermaid 降级视图，末尾的 `edgeever-diagram-v1` 注释保存 Base64URL 编码的 JSON IR。IR 是无损编辑的事实来源。Mermaid fence 是投影，不是实时画布：自有客户端（含公开分享）解析 IR 后由 AntV X6 绘制。保留 fence 是为了让笔记在 EdgeEver 之外的普通 Markdown 中仍可读，以及 IR 注释解析失败时仍能降级显示。

普通富文本笔记里用户手写的 ` ```mermaid ` 代码块是独立功能，不走这套 IR，也不是可视化图表笔记。

解析和校验集中在 [`packages/shared/src/diagram.ts`](../packages/shared/src/diagram.ts)。语义图编译与自动布局在 [`packages/shared/src/diagram-layout.ts`](../packages/shared/src/diagram-layout.ts)。只读画布的 X6 适配器在 [`packages/shared/src/diagram-view.ts`](../packages/shared/src/diagram-view.ts)（`diagramDocumentToX6Cells`），供 Android、iOS 与公开分享复用；Web / 桌面编辑器使用同一 IR，但有自己的可交互节点映射。

## 为什么使用 AntV X6

可视化图表笔记需要一块可编辑画布：选择、拖拽、缩放、连线、撤销重做、键盘操作、自动布局和 PNG/SVG 导出。AntV X6 提供的是这套画布内核，而不是某一种图表类型的产品模型。思维导图、流程图和架构图共用同一引擎，差异落在 IR 语义和 EdgeEver 的节点、连线定制上。

IR 负责回答“这张图表达什么”，X6 适配器负责回答“当前如何把它画出来并让用户改”。因此不把 X6 内部状态、坐标约定或视图实例写进持久化格式。如果为某一类图表另选引擎，会同时引入另一套状态管理、坐标体系、交互约定和数据格式，并让两套画布长期并存。

Android、iOS 的只读查看和公开分享复用同一套 X6 适配器（`diagramDocumentToX6Cells` 加不可交互的 `Graph`）。Web / 桌面编辑器走同一 IR 和同一引擎，但使用可交互的编辑器映射。自有客户端画布不再按「Web 用 X6、移动端用 Mermaid」分轨。Mermaid 仍用于可移植信封、富文本嵌入图表，以及 IR 解析失败时的降级。

这并不意味着把所有节点画成同一种 X6 矩形。X6 只是底层引擎；图标、SVG 标记、形状、端口、配色、边界和连线语义均由 EdgeEver 按图表类型定制。

## 跨端渲染边界

| 场景 | 能力 | 渲染路径 |
| --- | --- | --- |
| Web / PWA / 桌面端 | 创建、编辑、自动布局、历史版本、PNG/SVG 导出 | IR → AntV X6 |
| Android App | 语义化只读查看，完整保留 IR | IR → AntV X6（笔记 WebView 中的只读 Graph） |
| iOS App | 语义化只读查看，完整保留 IR | IR → AntV X6（WKWebView 中的只读 Graph） |
| 图形笔记的公开分享 | 同一份 IR 的只读查看 | IR → AntV X6（只读 Graph） |
| 普通富文本笔记，含嵌入的 ` ```mermaid ` 代码块 | 创建、编辑、分享、HTML / 打印 / 微信复制 | TipTap；Mermaid 代码块仍走 Mermaid |
| IR 注释无效或无法解析 | 同一张图形笔记的降级阅读 | Markdown 正文中的 Mermaid fence |

原生 App 暂不开放普通富文本编辑、双击编辑或 AI 改写入口，因为这些路径无法表达图表 IR，可能把结构化图表覆盖成普通文本。用户可在 App 中阅读、同步、分享和查看历史版本，在 Web 或桌面端完成图表编辑。

移动端早期用 Mermaid fence 看图，是因为原生 WebView 尚未封装 AntV X6。那条双轨已经是历史。自有客户端画布（含公开分享）由 IR 经 X6 绘制图形笔记。普通富文本里嵌入的 Mermaid 图表是独立功能，继续走 Mermaid 渲染器。

## 已确定的设计原则

- 图表语义由 IR 决定，渲染引擎不是数据源。
- 自有客户端画布由 IR 经 X6 绘制图形笔记。普通富文本里的 ` ```mermaid ` 代码块仍走 Mermaid。图形笔记里持久化的 Mermaid fence 只是可移植信封和降级路径，不是实时画布。
- 架构组件必须“看外观就知道用途”，名称只是补充。
- `parentId` 表示包含关系：思维导图是主题层级，架构图是系统边界；系统边界不是可连线的普通业务节点。
- `theme` 与思维导图的 `structure` 属于文档上的呈现选择，不是引擎私有状态。
- Web 与原生 App 使用同一份持久化数据，不维护平台专属图表副本。
- 新版本优先保持旧图可读；格式演进通过 `schemaVersion` 明确管理，信封注释名保持 `edgeever-diagram-v1`。
- 在原生触控编辑器能够安全读写同一 IR 之前，App 保持只读。

## MCP 与 AI 生成图表

对于 MCP 和 AI，语义图是稳定的工具协议：Agent 不必生成 X6 内部配置、SVG 或整张 Mermaid 源码，因此可以理解和执行“在 API 与数据库之间增加 Redis 缓存”这类局部修改，同时保留用户已经调整好的其他节点和布局。

当前图表 MCP 工具只有三个：

- `create_diagram_memo` 接收语义图：节点标识、名称、类型、容器关系与连接关系，以及可选的 `theme`、`structure` 和 `layout.direction`。服务端生成连线标识、节点尺寸、坐标、确定性布局和架构边界几何，再编译为持久化 `DiagramDocument`。布局方向只是编译提示，不写入持久化文档。返回语义图，不返回编码后的持久化载荷。
- `get_diagram` 默认只返回语义图和笔记 revision，不含坐标与尺寸；只有 `includeLayout` 为 true 时才附带节点几何。
- `update_diagram` 在同一工具上接收增量操作 `add_node` / `update_node` / `remove_node` / `add_edge` / `update_edge` / `remove_edge`。用 `expectedRevision` 防止并发覆盖，支持 `dryRun` 预览。默认 `reflow=preserve`，保留未受影响节点的已有布局；仅在明确要求整图重排时使用 `reflow=all`。移入系统边界或调整思维导图层级，是 `update_node` 的 `parentId`，不是单独的 MCP 工具。

通用的 `update_memo` 不允许直接覆盖图表正文。没有 `replace_diagram_ir`，也没有独立的校验或自动布局工具：校验发生在服务端应用操作时，布局由 `reflow` 控制。

推荐流程是：

```text
get_diagram
  → AI 生成增量操作
  → 可选 dryRun 预览
  → update_diagram（默认保留布局）
  → 服务端校验类型、引用和容器关系后写入新版本
```

AI 默认改语义层；确定性布局算法负责坐标。只有用户明确要求整图重排或调整外观时，才使用 `reflow=all` 或修改 `theme` / `structure`。

Schema 应保持小而稳定、可版本化、可校验，并继续走增量操作。如果格式过度贴近 X6、语义过少、版本频繁变化，或允许不经校验地覆盖整张图，IR 就会变成新的耦合点。

## 后续演进方向

如果要实现原生 App 完整编辑，应继续复用同一 IR，并单独设计触控选择、拖拽、连线、缩放、键盘避让和大图性能。是否复用 X6 WebView 或开发原生画布，应通过原型和性能测试决定，而不应改变已保存的数据格式。

图形笔记的 HTML / 打印 / 微信复制若走通用富文本管道，仍会快照 TipTap HTML 而不是 X6 画布。原生端的图片分享同样如此。应先让这些导出与只读 X6 快照对齐，再考虑改动 Markdown 信封。图表编辑器里的 PNG / SVG 导出已经直接来自 X6。
