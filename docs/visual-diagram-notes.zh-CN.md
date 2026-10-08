# 可视化图表笔记设计说明

EdgeEver 有两条图形笔记路径：思维导图、流程图和架构图使用 `DiagramDocument`；信息图使用 AntV Infographic 语法。两者独立保存，不自动互转。

## 图形笔记

`DiagramDocument` 是可编辑图形的事实来源，保存节点、连线、必要布局和语义，而非 X6 视图状态。`kind` 区分 `mind-map`、`flowchart`、`architecture`；`schemaVersion` 管理格式演进。架构图的系统边界和连接类型、思维导图的层级关系也保存在文档中。

Web 和桌面端用 AntV X6 编辑；Android、iOS 和公开分享用同一份 IR 只读绘制。持久化 Markdown 的 `edgeever-diagram-v1` 注释保存 Base64URL 编码的 IR，正文中的 Mermaid 图表用于外部阅读及 IR 解析失败时降级，不是编辑画布。普通笔记内的 Mermaid 代码块属于独立功能。

Web 和桌面端的思维导图可在画布与 Markdown 大纲间切换。根主题使用 `#` 标题，分支使用嵌套的 `-` 列表，每级缩进两个空格。Enter 续写列表，Tab / Shift+Tab 调整层级，也兼容粘贴已有的纯缩进大纲。空列表项不会成为导图节点，非空子项会接到最近的非空上级；两种视图编辑同一份 `DiagramDocument`，不会把 Mermaid 正文当成可编辑源文件。大纲需要一个非空根主题；无效层级不会写回导图，一次删除大量主题须确认。已有节点和连线在往返切换时保留身份及元数据，层级变化会重新排版。

解析与校验见 [`diagram.ts`](../packages/shared/src/diagram.ts)，语义图编译及布局见 [`diagram-layout.ts`](../packages/shared/src/diagram-layout.ts)，跨端只读绘制见 [`diagram-view.ts`](../packages/shared/src/diagram-view.ts)。原生 App 在能安全读写同一 IR 前保持只读。

## 信息图

信息图是独立笔记类型，以 AntV Infographic 的声明式语法为源文件；模板、主题和数据直接写在该语法中。`InfographicDocument` 用 `edgeever-infographic-v1` 注释保存它，EdgeEver 不再复制一套同义的通用 IR。两种笔记由各自的解析器处理。

若将来要用 Infographic 展示图形笔记，需要显式的 `DiagramDocument → Infographic` 转换，并说明无法保留的布局或交互信息；在验证双向映射前，不迁移既有笔记。

## AI 与 MCP

图形笔记的 AI / MCP 输入是不含坐标的语义图，由服务端校验并生成布局。`create_diagram_memo` 创建图形笔记，`get_diagram` 读取语义图，`update_diagram` 用增量操作修改，并通过 `expectedRevision` 防止覆盖；默认 `reflow=preserve`，只有明确要求整图重排时才用 `reflow=all`。通用 `update_memo` 不直接覆盖图形笔记内容。

信息图的 AI 选择 AntV 模板并生成对应数据，人工可在画布上微调文字。两条路径都保留各自的事实来源，不把渲染结果当作持久化文档。
