import { prefersChineseContent } from "./bilingual-content-locale";

export type InfographicSampleCategory =
  | "sequence"
  | "compare"
  | "list"
  | "quadrant"
  | "hierarchy"
  | "relation"
  | "chart";

export type InfographicSample = {
  id: string;
  category: InfographicSampleCategory;
  template: string;
  titleZh: string;
  titleEn: string;
  titleJa?: string;
  descZh: string;
  descEn: string;
  descJa?: string;
  syntaxZh: string;
  syntaxEn: string;
};

export const INFOGRAPHIC_SAMPLE_CATEGORIES: Array<{
  id: InfographicSampleCategory;
  key: string;
  labelZh: string;
  labelEn: string;
  labelJa: string;
}> = [
  { id: "sequence", key: "sequenceCategory", labelZh: "顺序 / 流程", labelEn: "Sequence", labelJa: "順序・工程" },
  { id: "compare", key: "comparisonCategory", labelZh: "对比 / SWOT", labelEn: "Comparison", labelJa: "比較・SWOT" },
  { id: "list", key: "listCategory", labelZh: "列表 / 金字塔", labelEn: "List", labelJa: "リスト" },
  { id: "quadrant", key: "quadrantCategory", labelZh: "四象限矩阵", labelEn: "Quadrant", labelJa: "四象限" },
  { id: "hierarchy", key: "hierarchyCategory", labelZh: "层级 / 脑图", labelEn: "Hierarchy", labelJa: "階層・マインドマップ" },
  { id: "relation", key: "relationCategory", labelZh: "关系拓扑", labelEn: "Relation", labelJa: "関係ネットワーク" },
  { id: "chart", key: "chartCategory", labelZh: "统计图表", labelEn: "Chart", labelJa: "チャート" },
];

export const INFOGRAPHIC_SAMPLES: InfographicSample[] = [
  // 1. sequence
  {
    id: "sequence-steps",
    category: "sequence",
    template: "sequence-steps-simple",
    titleZh: "产品研发全周期流程",
    titleEn: "Product Development Lifecycle",
    titleJa: "製品開発ライフサイクル",
    descZh: "从需求分析到上线发布的标准敏捷研发流程",
    descEn: "Standard agile workflow from discovery to deployment",
    descJa: "要件定義からリリースまでの標準アジャイル開発フロー",
    syntaxZh: `infographic sequence-steps-simple
data
  title 产品研发全周期流程
  desc 从需求调研到交付上线的关键阶段
  sequences
    - label 需求分析
      desc 收集用户反馈与商业目标规划
    - label 原型设计
      desc 交互界面与用户体验方案输出
    - label 敏捷研发
      desc 前后端核心功能模块编码实现
    - label 质量验证
      desc 自动化测试与全链路回归演练
    - label 发布上线
      desc 灰度放量与生产环境监控护航`,
    syntaxEn: `infographic sequence-steps-simple
data
  title Product Development Lifecycle
  desc Key stages from discovery to production launch
  sequences
    - label Discovery & Specs
      desc Gather user feedback and define key requirements
    - label UI & Prototype
      desc Design user flows and high-fidelity mockups
    - label Agile Sprint
      desc Full-stack engineering and feature implementation
    - label Quality Assurance
      desc Automated tests, regression audits, and performance checks
    - label Production Release
      desc Phased rollout and real-time observability`,
  },
  {
    id: "sequence-timeline",
    category: "sequence",
    template: "sequence-timeline-done-list",
    titleZh: "企业发展关键里程碑",
    titleEn: "Company Milestones Timeline",
    titleJa: "企業の主要マイルストーン",
    descZh: "记录团队从创立到规模化的关键跃迁时刻",
    descEn: "Key turning points from inception to scale",
    descJa: "創業からスケール期までの重要マイルストーン",
    syntaxZh: `infographic sequence-timeline-done-list
data
  title 企业发展关键里程碑
  desc 记录团队从创立到规模化的关键跃迁
  sequences
    - label 2022 年初创成立
      desc 核心创始团队组建，完成天使轮融资
    - label 2023 产品 1.0 发布
      desc 突破首批 10,000 名种子活跃用户
    - label 2024 商业化落地
      desc 上线企业级协同能力，实现自负盈亏
    - label 2025 全球化出海
      desc 布局多语言与跨国合规部署架构`,
    syntaxEn: `infographic sequence-timeline-done-list
data
  title Company Milestones Timeline
  desc Key turning points from inception to scale
  sequences
    - label 2022 Founding
      desc Core team assembled and seed round completed
    - label 2023 Product 1.0
      desc Surpassed first 10,000 active users
    - label 2024 Monetization
      desc Enterprise collaboration launched with break-even revenue
    - label 2025 Global Expansion
      desc Multi-region compliance and localized deployments`,
  },
  {
    id: "sequence-roadmap",
    category: "sequence",
    template: "sequence-roadmap-vertical-simple",
    titleZh: "技术架构演进路线图",
    titleEn: "Architecture Evolution Roadmap",
    titleJa: "技術アーキテクチャのロードマップ",
    descZh: "基础设施升级与云原生转型的演进路径",
    descEn: "Infrastructure modernization and cloud-native journey",
    descJa: "インフラ刷新とクラウドネイティブ化の歩み",
    syntaxZh: `infographic sequence-roadmap-vertical-simple
data
  title 技术架构演进路线图
  desc 基础设施升级与云原生转型的演进路径
  sequences
    - label 阶段一：单体解耦
      desc 拆分核心数据模型，建立统一领域服务接口
    - label 阶段二：容器编排
      desc 全面接入 Kubernetes，实现声明式部署与调度
    - label 阶段三：服务网格
      desc 引入 Istio 网格，实现精细化流量治理与可观测性
    - label 阶段四：智能运维
      desc 结合大模型与日志度量，落地自愈式巡检告警`,
    syntaxEn: `infographic sequence-roadmap-vertical-simple
data
  title Architecture Evolution Roadmap
  desc Infrastructure modernization and cloud-native journey
  sequences
    - label Phase 1: Modular Monolith
      desc Decouple core domain models and define clean contracts
    - label Phase 2: Containerization
      desc Adopt Kubernetes for declarative deployments and scaling
    - label Phase 3: Service Mesh
      desc Introduce Istio for traffic control and fine-grained telemetry
    - label Phase 4: AIOps Automation
      desc Autonomous anomaly detection and self-healing alerts`,
  },

  // 2. compare
  {
    id: "compare-vs",
    category: "compare",
    template: "compare-binary-horizontal-compact-card-vs",
    titleZh: "云原生与传统部署对比",
    titleEn: "Cloud-Native vs Traditional Hosting",
    titleJa: "クラウドネイティブと従来運用の比較",
    descZh: "架构灵活性与运维成本的深度权衡分析",
    descEn: "Architectural agility and infrastructure cost trade-offs",
    descJa: "拡張性と運用コストの包括的な比較分析",
    syntaxZh: `infographic compare-binary-horizontal-compact-card-vs
data
  title 云原生与传统部署对比
  desc 架构灵活性与运维成本的全面权衡
  compares
    - label 传统物理部署
      desc 依赖固定机房资产与人工维护
      children
        - label 弹性扩展
          desc 扩容周期通常需要数周甚至数月
        - label 资源利用率
          desc 峰谷波动大，服务器平均闲置率高
        - label 运维复杂度
          desc 人工巡检部署，故障恢复时间较长
    - label 云原生架构
      desc 容器化编排与按需弹性扩缩容
      children
        - label 弹性扩展
          desc 秒级自动伸缩，轻松应对突发流量
        - label 资源利用率
          desc 多租户动态调度，整体成本优化 40%
        - label 运维复杂度
          desc CI/CD 自动化流水线与自愈式监控`,
    syntaxEn: `infographic compare-binary-horizontal-compact-card-vs
data
  title Cloud-Native vs Traditional Hosting
  desc Architectural agility and infrastructure cost trade-offs
  compares
    - label Traditional Dedicated Server
      desc Fixed on-premise hardware and manual maintenance
      children
        - label Scalability
          desc Provisioning new hardware takes weeks or months
        - label Resource Utilization
          desc Peak-provisioned servers sit idle most of the day
        - label Operational Overhead
          desc Manual patching and slower disaster recovery
    - label Cloud-Native Platform
      desc Containerized orchestration with on-demand autoscaling
      children
        - label Scalability
          desc Sub-second auto-scaling handles traffic spikes seamlessly
        - label Resource Utilization
          desc Dynamic multi-tenant scheduling cuts infrastructure cost 40%
        - label Operational Overhead
          desc Automated CI/CD pipelines and self-healing nodes`,
  },
  {
    id: "compare-swot",
    category: "compare",
    template: "compare-swot",
    titleZh: "产品战略 SWOT 分析",
    titleEn: "Strategic SWOT Analysis",
    titleJa: "製品戦略の SWOT 分析",
    descZh: "全面审视内部优劣势与外部市场机遇威胁",
    descEn: "Internal strengths/weaknesses and external market opportunities/threats",
    descJa: "内部の強み・弱みと外部の機会・脅威の網羅分析",
    syntaxZh: `infographic compare-swot
data
  title 产品战略 SWOT 分析
  desc 全面审视内部优劣势与外部市场环境
  compares
    - label 优势 (Strengths)
      children
        - label 核心专利技术壁垒
          desc 拥有业内领先的离线协同与加密算法
        - label 敏捷响应能力
          desc 团队扁平，两周一次稳定迭代演进
    - label 劣势 (Weaknesses)
      children
        - label 品牌知名度有限
          desc 市场拓展初期，整体认知度仍在积累
        - label 移动端覆盖刚起步
          desc 部分跨平台高级交互仍在完善中
    - label 机会 (Opportunities)
      children
        - label 远程与混合办公普及
          desc 全球知识管理协同工具需求持续增长
        - label AI Agent 生态蓬勃
          desc 与大模型协同工作流带来全新爆发点
    - label 威胁 (Threats)
      children
        - label 头部大厂生态挤压
          desc 巨头免费捆绑分发带来的竞争压力
        - label 数据合规监管趋严
          desc 全球各地区合规成本与审查风险上升`,
    syntaxEn: `infographic compare-swot
data
  title Strategic SWOT Analysis
  desc Internal strengths/weaknesses and external market environment
  compares
    - label Strengths
      children
        - label Proprietary Tech
          desc Industry-leading offline-first sync algorithms
        - label Rapid Execution
          desc Flat engineering team with bi-weekly stable releases
    - label Weaknesses
      children
        - label Brand Awareness
          desc Early stage market presence still expanding
        - label Mobile Parity
          desc Advanced cross-platform interactions still maturing
    - label Opportunities
      children
        - label Remote Collaboration
          desc Global demand for lightweight self-hosted knowledge bases
        - label AI Agent Ecosystem
          desc Model Context Protocol unlocks novel assistant workflows
    - label Threats
      children
        - label Incumbent Bundling
          desc Big-tech suites offering free bundled alternatives
        - label Compliance Complexity
          desc Stricter multi-region data residency and audits`,
  },
  {
    id: "compare-arrow",
    category: "compare",
    template: "compare-binary-horizontal-simple-arrow",
    titleZh: "工程体系重构演进",
    titleEn: "Engineering Workflow Evolution",
    titleJa: "エンジニアリング体系の進化",
    descZh: "从传统手工操作升级为现代高度自动化流程",
    descEn: "Transition from manual operations to modern automated workflows",
    descJa: "手動オペレーションから自動化パイプラインへの進化",
    syntaxZh: `infographic compare-binary-horizontal-simple-arrow
data
  title 工程体系重构演进
  desc 从传统手工操作升级为现代高度自动化流程
  compares
    - label 过去：手工碎片化
      desc 依赖人工执行脚本与零散文档传递
      children
        - label 交付节奏
          desc 每月一次集中发布，风险积聚
        - label 质量门槛
          desc 依赖人工点工测试，漏测率高
    - label 现在：持续自动化
      desc 代码提交即触发完整验证流水线
      children
        - label 交付节奏
          desc 每日主干集成，随时可发布生产
        - label 质量门槛
          desc 90% 自动化测试覆盖与分支保护`,
    syntaxEn: `infographic compare-binary-horizontal-simple-arrow
data
  title Engineering Workflow Evolution
  desc Transition from manual tasks to fully automated pipelines
  compares
    - label Legacy: Manual & Fragmented
      desc Ad-hoc scripts and tribal knowledge
      children
        - label Release Cadence
          desc Monthly batch releases with accumulated risk
        - label Quality Gate
          desc Manual QA passes with high escape rates
    - label Modern: Continuous & Automated
      desc Git push triggers end-to-end verification
      children
        - label Release Cadence
          desc Trunk-based development deployable anytime
        - label Quality Gate
          desc 90% test coverage with automated branch protection`,
  },

  // 3. list
  {
    id: "list-grid",
    category: "list",
    template: "list-grid-simple",
    titleZh: "团队高效协同五大原则",
    titleEn: "Team Collaboration Principles",
    titleJa: "チーム協調の 5 大原則",
    descZh: "打造透明、自驱、可预测的高效工程文化",
    descEn: "Fostering a transparent, autonomous, and predictable culture",
    descJa: "自律的で予測可能な高効率エンジニアリング文化",
    syntaxZh: `infographic list-grid-simple
data
  title 团队高效协同五大原则
  desc 打造透明、自驱、可预测的工程文化
  lists
    - label 异步优先
      desc 完整记录决策上下文，减少打断式即时会议
    - label 文档即代码
      desc 核心架构与规范以 Markdown 纳管审查
    - label 小步快跑
      desc 频繁合并短生命周期分支，降低集成风险
    - label 自动化验证
      desc 单元测试与端到端回归门禁拦截潜在缺陷
    - label 结果导向
      desc 聚焦交付价值与用户体验，避免形式主义`,
    syntaxEn: `infographic list-grid-simple
data
  title Team Collaboration Principles
  desc Fostering a transparent, autonomous, and predictable culture
  lists
    - label Async First
      desc Document decisions clearly to minimize disruptive meetings
    - label Docs as Code
      desc Core architecture and standards reviewed in Markdown
    - label Small Iterations
      desc Merge short-lived branches frequently to derisk integration
    - label Automated Verification
      desc Strict unit and integration gates catch regressions early
    - label Value Focused
      desc Prioritize user outcome and polish over bureaucracy`,
  },
  {
    id: "list-pyramid",
    category: "list",
    template: "list-pyramid-compact-card",
    titleZh: "DIKW 知识层级金字塔",
    titleEn: "DIKW Knowledge Hierarchy",
    titleJa: "DIKW ピラミッドモデル",
    descZh: "从原始事实到深刻见解的认知跃升模型",
    descEn: "Cognitive progression from raw facts to actionable wisdom",
    descJa: "データから知恵への認知の階層的ステップ",
    syntaxZh: `infographic list-pyramid-compact-card
data
  title DIKW 知识层级金字塔
  desc 从原始事实到深刻见解的认知跃升模型
  lists
    - label 智慧 (Wisdom)
      desc 洞察未来趋势与深层本质的决策力
    - label 知识 (Knowledge)
      desc 经验积累、思维模型与实践方法论
    - label 信息 (Information)
      desc 结构化整理、具备上下文的数据集合
    - label 数据 (Data)
      desc 未经加工的原始事实与客观记录`,
    syntaxEn: `infographic list-pyramid-compact-card
data
  title DIKW Knowledge Hierarchy
  desc Cognitive progression from raw facts to actionable wisdom
  lists
    - label Wisdom
      desc Foresight, strategic clarity, and principled judgment
    - label Knowledge
      desc Contextual understanding, mental models, and expertise
    - label Information
      desc Structured, organized, and relational data points
    - label Data
      desc Objective facts, signals, and raw observations`,
  },

  // 4. quadrant
  {
    id: "quadrant-matrix",
    category: "quadrant",
    template: "compare-quadrant-quarter-simple-card",
    titleZh: "时间管理四象限法则",
    titleEn: "Eisenhower Priority Matrix",
    titleJa: "時間管理のマトリクス",
    descZh: "按重要性与紧迫性科学分配精力与优先级",
    descEn: "Allocate focus and bandwidth by importance and urgency",
    descJa: "重要度と緊急度で優先順位を整理する枠組み",
    syntaxZh: `infographic compare-quadrant-quarter-simple-card
data
  title 时间管理四象限法则
  desc 按重要性与紧急性科学规划工作重心
  compares
    - label 第一象限：重要且紧急
      desc 危机突发事件、紧急生产事故与临近截期的核心交付
    - label 第二象限：重要不紧急
      desc 长期战略规划、技术重构、深度学习与身心健康建设
    - label 第三象限：紧急不重要
      desc 突发临时打断、次要琐事与非必要的即时沟通
    - label 第四象限：不重要不紧急
      desc 无效社交闲聊、过度刷屏消遣与低价值重复劳动`,
    syntaxEn: `infographic compare-quadrant-quarter-simple-card
data
  title Eisenhower Priority Matrix
  desc Allocate focus and bandwidth by importance and urgency
  compares
    - label Q1: Urgent & Important
      desc Production crises, hard deadlines, and pressing issues
    - label Q2: Not Urgent but Important
      desc Strategic planning, refactoring, learning, and self-care
    - label Q3: Urgent but Not Important
      desc Unplanned interruptions, trivial requests, and busywork
    - label Q4: Not Urgent & Not Important
      desc Distractions, mindless browsing, and low-value tasks`,
  },

  // 5. hierarchy
  {
    id: "hierarchy-mindmap",
    category: "hierarchy",
    template: "hierarchy-mindmap-branch-gradient-lined-palette",
    titleZh: "现代 Web 全栈技术体系",
    titleEn: "Modern Web Architecture",
    titleJa: "モダン Web フルスタック体系",
    descZh: "现代化 Web 应用各层级核心组件与选型参考",
    descEn: "Core technical components of modern web applications",
    descJa: "モダン Web アプリケーションの要素と技術選定",
    syntaxZh: `infographic hierarchy-mindmap-branch-gradient-lined-palette
data
  title 现代 Web 全栈技术体系
  desc 现代化 Web 应用各层级核心选型
  root
    label 全栈技术体系
    children
      - label 前端运行时
        desc React / Vite 响应式交互
      - label 服务端逻辑
        desc Hono / Cloudflare Workers
      - label 存储与缓存
        desc D1 SQLite / R2 对象存储
      - label 智能体协同
        desc Model Context Protocol`,
    syntaxEn: `infographic hierarchy-mindmap-branch-gradient-lined-palette
data
  title Modern Web Architecture
  desc Core technical components of modern web applications
  root
    label Full-Stack Stack
    children
      - label Frontend Layer
        desc React & Vite reactive interfaces
      - label Backend Services
        desc Hono on edge serverless runtime
      - label Storage Layer
        desc D1 SQLite & R2 object storage
      - label AI Synergy
        desc Model Context Protocol tools`,
  },

  // 6. relation
  {
    id: "relation-network",
    category: "relation",
    template: "relation-network-simple-circle-node",
    titleZh: "分布式服务拓扑网络",
    titleEn: "Distributed Microservice Mesh",
    titleJa: "分散サービス・トポロジー",
    descZh: "微服务间调用关系与数据流动链路可视化",
    descEn: "Invocations and data pipelines between core services",
    descJa: "マイクロサービス間の連携とデータフロー",
    syntaxZh: `infographic relation-network-simple-circle-node
data
  title 分布式服务拓扑网络
  desc API 网关与后端核心微服务调用链路
  nodes
    - id gateway
      label 统一 API 网关
      desc 流量调度与鉴权中心
    - id auth
      label 统一认证服务
      desc JWT 校验与权限模型
    - id note
      label 笔记核心服务
      desc 内容版本控制与元数据
    - id sync
      label 同步引擎服务
      desc 离线游标与协同合并
  relations
    - from gateway
      to auth
    - from gateway
      to note
    - from note
      to sync`,
    syntaxEn: `infographic relation-network-simple-circle-node
data
  title Distributed Microservice Mesh
  desc Invocations and data pipelines between core services
  nodes
    - id gateway
      label API Gateway
      desc Ingress routing and TLS termination
    - id auth
      label Auth Service
      desc Token validation and RBAC enforcement
    - id note
      label Note Core
      desc Content revision engine and SQLite storage
    - id sync
      label Sync Engine
      desc Offline cursors and conflict resolution
  relations
    - from gateway
      to auth
    - from gateway
      to note
    - from note
      to sync`,
  },

  // 7. chart
  {
    id: "chart-donut",
    category: "chart",
    template: "chart-pie-donut-plain-text",
    titleZh: "产品用户来源构成占比",
    titleEn: "User Acquisition Breakdown",
    titleJa: "ユーザー獲得チャネル比率",
    descZh: "各渠道活跃新用户的占比构成分布",
    descEn: "Share of new active users across primary channels",
    descJa: "新規アクティブユーザーの獲得チャネル内訳",
    syntaxZh: `infographic chart-pie-donut-plain-text
data
  title 产品用户来源构成占比
  desc 季度新增活跃用户的核心来源渠道构成
  values
    - label 开源社区口碑
      value 45
    - label 搜索引擎自然流量
      value 25
    - label 技术博客与媒体
      value 18
    - label 线下沙龙与推荐
      value 12`,
    syntaxEn: `infographic chart-pie-donut-plain-text
data
  title User Acquisition Breakdown
  desc Share of new active users across primary channels
  values
    - label Open Source Word-of-Mouth
      value 45
    - label Organic Search
      value 25
    - label Tech Blogs & Social
      value 18
    - label Developer Events
      value 12`,
  },
  {
    id: "chart-column",
    category: "chart",
    template: "chart-column-simple",
    titleZh: "季度特性交付速率对比",
    titleEn: "Quarterly Feature Delivery",
    titleJa: "四半期ごとの機能リリース速度",
    descZh: "近四个季度研发团队完成的核心特性数量",
    descEn: "Number of major customer-facing capabilities shipped",
    descJa: "過去 4 四半期に提供した主要機能の推移",
    syntaxZh: `infographic chart-column-simple
data
  title 季度特性交付速率对比
  desc 近四个季度研发团队交付的核心业务特性统计
  values
    - label Q1 季度
      value 18
    - label Q2 季度
      value 26
    - label Q3 季度
      value 35
    - label Q4 季度
      value 42`,
    syntaxEn: `infographic chart-column-simple
data
  title Quarterly Feature Delivery
  desc Number of major customer-facing capabilities shipped
  values
    - label Q1
      value 18
    - label Q2
      value 26
    - label Q3
      value 35
    - label Q4
      value 42`,
  },
];

export function getSampleSyntax(sample: InfographicSample, lang?: string): string {
  return prefersChineseContent(lang) ? sample.syntaxZh : sample.syntaxEn;
}

export function getSampleTitle(sample: InfographicSample, lang?: string): string {
  if (lang && lang.toLowerCase().startsWith("zh")) return sample.titleZh;
  if (lang && lang.toLowerCase().startsWith("ja")) return sample.titleJa ?? sample.titleEn;
  return sample.titleEn;
}

export function getSampleDesc(sample: InfographicSample, lang?: string): string {
  if (lang && lang.toLowerCase().startsWith("zh")) return sample.descZh;
  if (lang && lang.toLowerCase().startsWith("ja")) return sample.descJa ?? sample.descEn;
  return sample.descEn;
}
