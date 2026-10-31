// Metadata shared by the browser editor and AI discovery. Layout builds remain
// in the existing Qiaomu Design implementation (MIT).
export const POSTER_DESIGN_TEMPLATES = [
  {
    "id": "paper-list",
    "zh": "书页清单",
    "en": "Bookish list",
    "fit": ["xhs", "portrait", "vertical", "xhs-square", "square"],
    "zhUse": "纸张纹理、淡背景文字、宋体大标题、编号与细横线；适合读书笔记、知识盘点。按空行分条，首行作书名，第二行可用“副标题：”添加副题，其余作正文",
    "enUse": "Textured ivory paper, faint background lettering, serif headlines, large numbers and fine rules; reading notes and knowledge lists. Separate entries with blank lines: book title first, optional second line starting with “Subtitle:”, then body text",
    "available": true
  },
  {
    "id": "minimal",
    "zh": "简约白",
    "en": "Minimal",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x"
    ],
    "zhUse": "干净克制，适合观点、读书、知识类",
    "enUse": "Clean and restrained; opinions, reading, knowledge",
    "available": true
  },
  {
    "id": "editorial",
    "zh": "杂志",
    "en": "Editorial",
    "fit": [
      "wechat",
      "x",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "衬线大标题 + 细线，有质感，适合深度内容与公众号",
    "enUse": "Serif headline with rules; essays and articles",
    "available": false
  },
  {
    "id": "bold",
    "zh": "醒目黄",
    "en": "Loud yellow",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical"
    ],
    "zhUse": "高饱和纯色 + 黑字，信息流里最抢眼",
    "enUse": "Saturated flat colour with black type; stops the scroll",
    "available": true
  },
  {
    "id": "dark",
    "zh": "深色科技",
    "en": "Dark tech",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat",
      "x",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "深底荧光点缀，适合 AI、编程、效率工具",
    "enUse": "Dark with a neon glow; AI, code, tools",
    "available": false
  },
  {
    "id": "poster",
    "zh": "大字报",
    "en": "Poster",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "vertical"
    ],
    "zhUse": "满屏居中大字，情绪强，适合金句、避坑、警告",
    "enUse": "Full-bleed centred type; punchy statements",
    "available": true
  },
  {
    "id": "split",
    "zh": "左文右图",
    "en": "Arch split",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat",
      "x",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "左文案右拱门：奶油底 + 橙色拱门窗 + 太阳圆 + 细线，右侧放人像或产品最好看",
    "enUse": "Copy on the left, an orange arch window on the right for a portrait or product; cream paper, a sun disc and fine rules",
    "available": true
  },
  {
    "id": "sticker",
    "zh": "便签",
    "en": "Sticky note",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "粉底便签纸，生活感，适合种草、日常、分享",
    "enUse": "Pink backdrop, paper note; lifestyle posts",
    "available": false
  },
  {
    "id": "gradient",
    "zh": "渐变光感",
    "en": "Soft gradient",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat",
      "x",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "蓝青渐变 + 白字，通用、稳、不出错",
    "enUse": "Blue-cyan gradient with white type; safe and versatile",
    "available": false
  },
  {
    "id": "center",
    "zh": "居中标签",
    "en": "Centered",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "细框居中，黄色高亮副标，通用百搭",
    "enUse": "Thin frame, centred, highlighted subtitle; all-purpose",
    "available": false
  },
  {
    "id": "checklist",
    "zh": "清单笔记",
    "en": "Checklist",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "标题 + 3~4 条要点，信息密度高，小红书干货首选",
    "enUse": "Headline plus 3–4 points; dense and useful",
    "available": false
  },
  {
    "id": "number",
    "zh": "数字干货",
    "en": "Big number",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "vertical",
      "youtube",
      "bilibili",
      "bilibili-43"
    ],
    "zhUse": "超大数字做钩子（7 个技巧 / 3 步），点击率高的榜单体",
    "enUse": "A huge numeral as the hook; listicles",
    "available": true
  },
  {
    "id": "impact",
    "zh": "油管冲击",
    "en": "Thumbnail punch",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical"
    ],
    "zhUse": "深蓝放射光 + 黄字黑描边硬阴影 + 红色角标，右侧留主体位；短标题效果最好",
    "enUse": "Blue sunburst, yellow type with a black outline and hard shadow, a red arrow and burst badge; room for a subject on the right",
    "photo": true,
    "available": false
  },
  {
    "id": "compare",
    "zh": "对比",
    "en": "Versus",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "斜切分屏：左边黯淡的“之前”，右边鲜亮的“之后”，中间一枚 VS；副标题写成「A | B」",
    "enUse": "A slanted split: dull “before” against vivid “after” with a VS burst; write the subtitle as “A | B”",
    "available": false
  },
  {
    "id": "neo",
    "zh": "新粗野",
    "en": "Neo-brutal",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical"
    ],
    "zhUse": "黑粗框 + 硬阴影 + 荧光底，年轻、有趣、辨识度高",
    "enUse": "Thick black borders, hard shadows, bright backdrop",
    "available": true
  },
  {
    "id": "soft",
    "zh": "柔雾莫兰迪",
    "en": "Soft haze",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x"
    ],
    "zhUse": "低饱和柔光，适合生活方式、情绪、穿搭、女性向",
    "enUse": "Muted haze; lifestyle, mood, fashion",
    "available": false
  },
  {
    "id": "swiss",
    "zh": "瑞士网格",
    "en": "Swiss grid",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "米白底 + 红圆 + 极粗无衬线 + 网格细线，国际主义风格",
    "enUse": "Off-white, a red disc, ultra-bold sans and grid hairlines",
    "available": true
  },
  {
    "id": "acid",
    "zh": "酸性渐变",
    "en": "Acid mesh",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical"
    ],
    "zhUse": "浅粉紫弥散光斑 + 颗粒 + 居中深紫大字 + 一枚闪光；潮流、音乐、AI 话题",
    "enUse": "Pastel mesh glows and grain, a centred deep-violet headline and one sparkle; trendy, music, AI",
    "available": true
  },
  {
    "id": "collage",
    "zh": "拼贴手账",
    "en": "Paper collage",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "bilibili",
      "wechat"
    ],
    "zhUse": "牛皮纸 + 撕纸色块 + 胶带 + 贴纸，生活、手账、种草",
    "enUse": "Kraft paper, torn colour blocks, tape and stickers; lifestyle and journaling",
    "available": true
  },
  {
    "id": "mega",
    "zh": "大字满版",
    "en": "Mega type",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "vertical",
      "youtube"
    ],
    "zhUse": "标题放大到撑满画面，高饱和纯色底，最强的信息流冲击力",
    "enUse": "The headline fills the artboard on a saturated colour; maximum scroll-stopping force",
    "available": true
  },
  {
    "id": "ticker",
    "zh": "跑马灯",
    "en": "Ticker",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "奶黄底 + 斜向滚动字带 + 硬阴影大字，B 站 / YouTube 的信息流利器",
    "enUse": "Cream with diagonal ticker bands and hard-shadow type; built for video feeds",
    "available": false
  },
  {
    "id": "memo",
    "zh": "便签笔记",
    "en": "Memo paper",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat"
    ],
    "zhUse": "横线笔记纸 + 红色页边线 + 荧光笔划重点，学习、笔记、干货",
    "enUse": "Ruled notebook paper with a margin line and a highlighter; study notes and tips",
    "available": true
  },
  {
    "id": "pop",
    "zh": "贴纸波普",
    "en": "Pop sticker",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical"
    ],
    "zhUse": "明黄底 + 黑色粗标题 + 几枚歪贴的粉、蓝、绿色块贴纸 + 白色胶囊副标题；年轻好玩，但不靠描边、硬投影和爆炸星",
    "enUse": "Yellow, heavy black type, a few tilted pink, blue and green stickers and a white pill subtitle; playful without outlines, hard shadows or bursts",
    "available": true
  },
  {
    "id": "mag",
    "zh": "杂志封面",
    "en": "Magazine",
    "fit": [
      "wechat",
      "x",
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "bilibili"
    ],
    "zhUse": "纸质底 + 衬线巨标题 + 巨型虚影期号 + 报头细线，像一本真杂志",
    "enUse": "Paper, a huge serif headline, a ghost issue numeral and masthead rules; a real magazine cover",
    "available": true
  },
  {
    "id": "print",
    "zh": "印刷海报",
    "en": "Print poster",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "黑 + 米白 + 一抹朱红，裁切线、套准标、沿边文字、条码，欧洲字体海报的语汇",
    "enUse": "Black, paper and one vermilion; crop marks, registration target, edge text and barcode: the European typographic poster vocabulary",
    "available": true
  },
  {
    "id": "glass",
    "zh": "玻璃卡片",
    "en": "Glass card",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat",
      "x"
    ],
    "zhUse": "粉蓝弥散背景 + 大幅磨砂玻璃卡片 + 悬浮小胶囊，现代、产品、App 感",
    "enUse": "Pastel mesh background, a large frosted glass card and floating pills; modern, product, app",
    "available": true
  },
  {
    "id": "bento",
    "zh": "便当清单",
    "en": "Bento list",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat"
    ],
    "zhUse": "深色标题卡 + 三张彩色要点卡拼成便当格，信息密度高又好看",
    "enUse": "A dark headline card and three colour cards in a bento grid; dense and good looking",
    "available": true
  },
  {
    "id": "neon",
    "zh": "霓虹网格",
    "en": "Neon grid",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat",
      "x",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "深色透视网格 + 霓虹发光字 + 取景框角标，AI、编程、赛博",
    "enUse": "Dark perspective grid, neon glow type and viewfinder corners; AI, code, cyber",
    "available": false
  },
  {
    "id": "calm",
    "zh": "松弛留白",
    "en": "Calm paper",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x"
    ],
    "zhUse": "云舞白纸 + 大号衬线标题 + 竖线与弧线 + 沿边小字，克制的“冷静风”",
    "enUse": "Cloud-white paper, a large serif headline, a vertical rule, an arc and edge text; quiet and restrained",
    "available": true
  },
  {
    "id": "folio",
    "zh": "编辑大标题",
    "en": "Editorial headline",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "纸面编辑版式：顶部粗线 + 栏目名与期号、贴左黑体大标题、宋体导语、底部细线收边；只有一个焦点，留白占一半",
    "enUse": "An editorial page: a heavy top rule with section and issue, a flush-left heavy headline, a serif standfirst and a hairline foot; one focal point, half the page left empty",
    "available": true
  },
  {
    "id": "numeral",
    "zh": "单色大数字",
    "en": "Big numeral",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat",
      "x"
    ],
    "zhUse": "一个巨型数字做钩子 + 其下小标题；单一强调色，适合清单、教程、数字干货",
    "enUse": "One oversized numeral as the hook, a quiet headline beneath; a single accent colour for lists, tutorials and number posts",
    "available": true
  },
  {
    "id": "sage",
    "zh": "纸质卡片",
    "en": "Paper card",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "低饱和鼠尾草底 + 一张米白纸卡，标题落在卡片上；温和、干净、有质感",
    "enUse": "A muted sage ground with one warm paper card carrying the headline; gentle, clean and tactile",
    "available": true
  },
  {
    "id": "seal",
    "zh": "书法印章",
    "en": "Ink & seal",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "vertical"
    ],
    "zhUse": "宣纸底 + 淡墨巨圆 + 大号衬线标题 + 红印章；纯中文短标题自动改竖排",
    "enUse": "Rice paper, a huge ink wash disc, a big serif headline and a red seal; short Chinese titles run vertically",
    "available": true
  },
  {
    "id": "quote",
    "zh": "金句海报",
    "en": "Quote poster",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x"
    ],
    "zhUse": "墨黑底 + 巨型金色引号 + 衬线金句，一句话撑满一张海报",
    "enUse": "Ink black, a giant gold quotation mark and a serif statement; one line carries the poster",
    "available": false
  },
  {
    "id": "cinema",
    "zh": "电影感",
    "en": "Cinematic",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat",
      "x"
    ],
    "zhUse": "青橙调光 + 镜头光晕 + 金色取景角 + 字距拉开的衬线片名，纪录片、Vlog、深度内容",
    "enUse": "Teal-and-orange light, lens flare, gold viewfinder corners and a wide-tracked serif title; documentary and vlog",
    "photo": true,
    "available": false
  },
  {
    "id": "bili",
    "zh": "B 站知识区",
    "en": "Bilibili explainer",
    "fit": [
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "youtube",
      "wide",
      "vertical",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "浅灰底 + B 站粉蓝双色 + 粉色分区标签 + 黑色大标题 + 小电视画框（屏幕是图位）；知识区、科普、测评的干净信息感",
    "enUse": "Light grey with Bilibili pink and blue, a section tag, a bold headline and a little-TV frame whose screen takes a picture; explainers and reviews",
    "available": true
  },
  {
    "id": "highlight",
    "zh": "荧光标题",
    "en": "Highlighter",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical",
      "wechat"
    ],
    "zhUse": "白纸黑字 + 每行标题下一道圆头荧光笔（每行微微不同的倾斜），像在笔记上划重点；干货、观点、教程都稳",
    "enUse": "Black type on white with a round-ended highlighter stroke under every line, each at its own slight tilt; tips, opinions and tutorials",
    "available": true
  },
  {
    "id": "notes",
    "zh": "备忘录",
    "en": "Notes app",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "手机备忘录截图：黄色返回键 + 日期 + 黑色大标题 + 勾选清单（要点写在 points 里）；小红书“截图型”，亲切可信",
    "enUse": "A phone notes screenshot: yellow back button, date, bold headline and a checklist from the points; personal and trustworthy",
    "available": true
  },
  {
    "id": "chat",
    "zh": "聊天截图",
    "en": "Chat bubbles",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical"
    ],
    "zhUse": "一问一答的聊天气泡：副标题是提问，标题是回答；对话感强，适合问答、AI、情感、职场",
    "enUse": "A chat exchange: the subtitle asks, the headline answers; Q&A, AI, relationships and work",
    "available": true
  },
  {
    "id": "keyword",
    "zh": "一词冲击",
    "en": "Keyword punch",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "缩略图式三词标题：饱和蓝底 + 超粗白字 + 一块黄色关键词标签（副标题）+ 主体位上一枚浅色圆盘（有图时主体站在上面）；不靠描边和爆炸星也抢眼",
    "enUse": "A three-word thumbnail: saturated blue, heavy white type, one yellow keyword tag (the subtitle) and a pale disc where the subject stands; loud without outlines or bursts",
    "photo": true,
    "available": true
  },
  {
    "id": "riso",
    "zh": "孔版印刷",
    "en": "Risograph",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "再生纸 + 荧光粉与蓝两种专色叠印 + 轻微错版 + 颗粒；独立杂志、展览、文艺与潮流话题",
    "enUse": "Recycled paper, fluorescent pink and blue overprinting with slight misregistration and grain; zines, shows and culture",
    "available": true
  },
  {
    "id": "ticket",
    "zh": "票根",
    "en": "Ticket stub",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "一张带缺口和齿孔的入场券：主券写标题，存根放标签与条码；活动、课程、展览、旅行",
    "enUse": "An admission ticket with notches and perforation: headline on the main part, label and barcode on the stub; events, courses, travel",
    "available": true
  },
  {
    "id": "window",
    "zh": "窗口教程",
    "en": "App window",
    "fit": [
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x"
    ],
    "zhUse": "柔和渐变底上一扇 macOS 风格窗口：红黄绿三点 + 文件名标签 + 窗口里的大标题；教程、工具、编程、效率",
    "enUse": "A macOS-style window on a soft gradient: traffic lights, a file tab and the headline inside; tutorials, tools and code",
    "available": true
  },
  {
    "id": "newspaper",
    "zh": "报纸头版",
    "en": "Front page",
    "fit": [
      "wechat",
      "x",
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "新闻纸 + 衬线报头（标签做报名）+ 双线 + 期号栏 + 分栏灰条；把观点做成“头版头条”，评论、深度、年度盘点",
    "enUse": "Newsprint, a serif masthead (the label), double rules, a dateline and greeked columns; opinion, analysis, annual reviews",
    "available": true
  },
  {
    "id": "polaroid",
    "zh": "拍立得",
    "en": "Polaroid",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat"
    ],
    "zhUse": "一张贴着胶带的拍立得相纸（相纸里是图位）+ 标签写在相纸下沿 + 旁边大标题；旅行、Vlog、生活记录",
    "enUse": "A taped instant photo (the print is a picture slot), the label on its lip and a big headline beside it; travel, vlogs, everyday life",
    "available": true
  },
  {
    "id": "stack",
    "zh": "叠字海报",
    "en": "Echo stack",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "vertical",
      "wechat",
      "x"
    ],
    "zhUse": "同一句标题上下重复、逐层变淡，中间一行是红色实字；字体海报的节奏感，适合短标题、口号、金句",
    "enUse": "The headline repeated in fading layers around one solid red line; a rhythmic type poster for short titles and slogans",
    "available": true
  },
  {
    "id": "serial",
    "zh": "栏目头图",
    "en": "Column header",
    "fit": [
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "xhs",
      "xhs-square",
      "portrait",
      "square"
    ],
    "zhUse": "深绿栏目条（栏目名 + 大期号，标签写“周刊 12”）+ 标题；公众号系列文章、周刊、播客的固定头图，转发裁成方图时标题仍在中间",
    "enUse": "A dark column band with the series name and a big issue number (label like “Weekly 12”) beside the headline; recurring newsletters and podcasts",
    "available": true
  },
  {
    "id": "regeng",
    "zh": "热梗卡",
    "en": "Daily drop",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat"
    ],
    "zhUse": "黑色话题条（#标签#）+ 三层错位描边卡片里的粗黑大字 + 左下“No.期号”；每日热梗、资讯速递、系列笔记，小红书辨识度很高",
    "enUse": "A black hashtag bar, a heavy headline in a stack of three offset outlined cards and an issue number; daily drops, news and series notes",
    "available": true
  },
  {
    "id": "interview",
    "zh": "黑黄箭头",
    "en": "Black & yellow",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "vertical"
    ],
    "zhUse": "黑底 + 黄色超粗标题 + 一条手绘大箭头指向标题 + 白框英文标签 + 角落笑脸；面试、考试、干货清单，强对比又不土",
    "enUse": "Black, a heavy yellow headline, one big hand-drawn arrow pointing at it, a boxed label and a corner smiley; interviews, exams and checklists",
    "available": true
  },
  {
    "id": "brush",
    "zh": "笔刷收藏",
    "en": "Brush highlight",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "白底粗黑标题 + 最后一行压一道绿色笔刷 + 歪贴的“建议收藏!”标签 + 底部 ✓ 清单（points）；副业、避坑、干货，最像小红书爆款笔记",
    "enUse": "Heavy black type on white, a green brush stroke under the last line, a tilted “save this” tag and a check row from the points; tips and side hustles",
    "available": true
  },
  {
    "id": "calendar",
    "zh": "日历页",
    "en": "Calendar page",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "纯蓝底 + 一张带装订环的白色日历页 + 页里的粗黑大字；每日一句、打卡、待办、节日，干净有仪式感",
    "enUse": "Flat blue with a white calendar page and binding rings, a heavy headline on the page; daily lines, check-ins and to-dos",
    "available": true
  },
  {
    "id": "frame",
    "zh": "框线大字",
    "en": "Framed type",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "x",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "纯色底 + 一圈细内框 + 撑满框的超大标题 + 一角出血的太阳圆；招聘、开学、通知、活动，最简单也最醒目",
    "enUse": "Flat colour, a thin inset frame, a headline that fills it and a sun disc bleeding off a corner; hiring, launches and notices",
    "available": true
  },
  {
    "id": "kicker",
    "zh": "粗细引题",
    "en": "Kicker headline",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "wechat",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide"
    ],
    "zhUse": "浅灰底：副标题当细字引题写在上面，标题粗黑放大 + 双线胶囊标签 + 底部“右滑查看 ››››”；经验、问答、职场，信息感强",
    "enUse": "Light grey: the subtitle as a thin kicker above a heavy headline, a double-ring pill tag and a “swipe” cue; experience posts, Q&A, work",
    "available": true
  },
  {
    "id": "corner",
    "zh": "斜角色块",
    "en": "Corner wedge",
    "fit": [
      "xhs",
      "xhs-square",
      "portrait",
      "square",
      "youtube",
      "bilibili",
      "bilibili-43",
      "bilibili-hd",
      "wide",
      "wechat"
    ],
    "zhUse": "白底 + 右下一大块斜切薄荷色 + 左上粗黑大字 + 黑色胶囊副标题 + 一条弯箭头；计划、清单、自律、学习，清爽有节奏",
    "enUse": "White with a big mint wedge from the lower right, a heavy headline top left, a black pill subtitle and a curved arrow; plans, lists and study",
    "available": true
  }
];
export function posterDesignTemplate(id: string) {
  const template = POSTER_DESIGN_TEMPLATES.find(template => template.id === id);
  if (!template) throw new Error('Unknown poster design template');
  const { available: _available, ...descriptor } = template;
  return descriptor;
}

export const POSTER_TEMPLATE_SELECTION_INSTRUCTION = "Before create_poster_memo, call get_poster_capabilities and read templates and browserDesignTemplates. Match zhUse/enUse to the user's content, intended style and target format; fit lists recommended platform IDs for browser designs. Respect an explicitly requested template. Choose a basic style ID from templates for create_poster_memo.template; browserDesignTemplates IDs are only for request_poster_render.templateId, even when IDs overlap. For a new poster, you may apply a matching browser design during initial rendering: create the poster, read get_poster for expectedRevision, then request_poster_render with templateId. This requires an online desktop/Web workspace; report pending or failed rendering honestly. For an existing poster, apply a different template only when the user explicitly requests a template change. With sections, basic styles share the same grid/list content layout and differ mainly in palette; their headline-only typography descriptions do not determine the section layout.";
