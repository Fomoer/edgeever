import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { MemoFilterMode, MemoSortMode } from "@edgeever/client";
import {
  Archive,
  BookOpen,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Code,
  Copy,
  ExternalLink,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Folder,
  Grid,
  HardDrive,
  Heading2,
  History,
  Home,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  KeyRound,
  Link,
  List,
  LogOut,
  Merge,
  Minus,
  MoreHorizontal,
  Music,
  Pencil,
  Pin,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  UserRound,
  Video,
  X,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  Image as RNImage,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { ApiToken, MemoDetail, MemoRevision, MemoSummary, Notebook, ResourceListItem, TagSummary } from "@edgeever/shared";
import { clearMobileMemoDraft, readMobileMemoDraft, writeMobileMemoDraft } from "../lib/mobile-drafts";
import {
  readMobileImageCompressionEnabled,
  readMobileLocalePreference,
  readMobileMemoListDensity,
  readMobileNotebookSort,
  readMobileResourceLayout,
  writeMobileImageCompressionEnabled,
  writeMobileLocalePreference,
  writeMobileMemoListDensity,
  writeMobileNotebookSort,
  writeMobileResourceLayout,
  type MobileLocalePreference,
  type MobileMemoListDensity,
  type MobileNotebookSortPreference,
  type MobileResourceLayoutPreference,
} from "../lib/preferences";
import { useSession } from "../lib/session";
import {
  deleteMobileSyncQueueItem,
  emptyMobileSyncQueueSummary,
  listMobileSyncQueueItems,
  loadMobileSyncQueueSummary,
  queueMobileMemoUpdate,
  shouldQueueMobileMemoSaveError,
  syncMobileQueuedChanges,
  type MobileSyncQueueItem,
  type MobileSyncQueueSummary,
} from "../lib/sync-queue";

const ALL_NOTES_ID = "all";
const DEFAULT_MEMO_TITLE = "无标题笔记";
const MOBILE_APP_VERSION = Constants.expoConfig?.version ?? "0.1.2";
const GITHUB_REPOSITORY_URL = "https://github.com/tianma-if/edgeever";
const EVERNOTE_IMPORT_SCRIPT_URL =
  "https://raw.githubusercontent.com/tianma-if/edgeever/main/scripts/import-evernote-enex-via-mcp.mjs";
const EVERNOTE_MIGRATION_PROMPT = `你是 AI 编程助手。请帮我把本地的印象笔记全量迁移到我当前部署的 EdgeEver 实例中：
1. 检查并使用 \`pipx install evernote-backup\` 自动安装备份工具。
2. 提示我输入印象笔记的用户名和密码并初始化数据库（指定 china 后端），随后同步数据并导出到 \`./evernote-export\` 目录。
3. 从 GitHub 下载最新版迁移脚本：\`${EVERNOTE_IMPORT_SCRIPT_URL}\` 到本地。
4. 安装脚本所需的本地图片压缩库 \`sharp\` 和 \`fast-xml-parser\` 依赖。
5. 使用先前配置的 URL 和 Token 运行该脚本完成迁移（脚本会自动进行 WebP 图片转换）：
   - 全量迁移：\`bun import-evernote-enex-via-mcp.mjs --input "./evernote-export" --yes\`
   - 指定迁移某些笔记本：追加 \`--include "笔记本A,笔记本B"\` 参数。

请告诉我你需要什么信息（如账号密码），收到后直接并发自动执行上述步骤。`;
const MEMO_TEMPLATES: MemoTemplate[] = [
  {
    id: "quick-note",
    title: "速记",
    description: "适合临时记录想法、链接和灵感。",
    contentMarkdown: "## 速记\n\n- \n\n## 后续动作\n\n- [ ] ",
    tags: ["template", "quick-note"],
  },
  {
    id: "meeting",
    title: "会议记录",
    description: "议题、结论和待办放在同一页。",
    contentMarkdown: "## 会议记录\n\n时间：\n参与人：\n\n## 议题\n\n- \n\n## 结论\n\n- \n\n## 待办\n\n- [ ] ",
    tags: ["template", "meeting"],
  },
  {
    id: "checklist",
    title: "清单",
    description: "快速列出待办、采购、项目检查项。",
    contentMarkdown: "## 清单\n\n- [ ] \n- [ ] \n- [ ] ",
    tags: ["template", "checklist"],
  },
  {
    id: "reading",
    title: "读书笔记",
    description: "摘录、观点和下一步阅读整理。",
    contentMarkdown: "## 读书笔记\n\n书名：\n作者：\n\n## 摘录\n\n> \n\n## 我的观点\n\n\n## 延伸问题\n\n- ",
    tags: ["template", "reading"],
  },
  {
    id: "daily",
    title: "每日复盘",
    description: "记录今天完成了什么、卡在哪里。",
    contentMarkdown: "## 每日复盘\n\n## 今天完成\n\n- \n\n## 遇到的问题\n\n- \n\n## 明天优先级\n\n- [ ] ",
    tags: ["template", "daily"],
  },
];

const formatExecutionEnvironment = (environment: string | null | undefined) => {
  switch (environment) {
    case "standalone":
      return "独立安装包";
    case "storeClient":
      return "Expo Go / 开发客户端";
    case "bare":
      return "Bare React Native";
    default:
      return environment || "未知";
  }
};
const ALL_TOKEN_SCOPES = [
  "read:notebooks",
  "write:notebooks",
  "read:memos",
  "write:memos",
  "read:resources",
  "write:resources",
  "read:tags",
  "write:tags",
];
const ADVANCED_PROMPTS = [
  {
    id: "persona",
    title: "人物画像",
    prompt:
      "请通过 EdgeEver MCP 读取我的笔记，基于真实笔记内容为我整理一份人物画像。请只根据笔记中的证据判断，不要做心理诊断，不要夸张定性。输出包括：长期关注的主题、做事偏好、能力线索、反复出现的问题、近期动向，并在每条结论后列出相关笔记标题或 memo id。",
  },
  {
    id: "knowledgeMap",
    title: "知识图谱",
    prompt:
      "请通过 EdgeEver MCP 读取我的笔记，为我整理一份知识地图。请找出主要知识领域、每个领域下的关键概念、相关笔记、我已经掌握的部分和还需要补齐的问题。输出结构要适合后续继续学习和写作。",
  },
  {
    id: "tagAdvice",
    title: "标签建议",
    prompt:
      "请通过 EdgeEver MCP 读取我的笔记和现有标签，帮我设计一套更清晰的标签体系。请指出重复、过细、过宽或命名不一致的标签，并给出合并、重命名和新增标签建议。先不要修改笔记，等我确认后再执行。",
  },
];
const MOBILE_LOCALE_OPTIONS: Array<{ label: string; value: MobileLocalePreference }> = [
  { label: "跟随系统", value: "system" },
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
];
const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const MAX_COMPRESSED_IMAGE_EDGE = 2560;
const IMAGE_COMPRESSION_QUALITY = 0.82;

type MobileView = "notes" | "search" | "account" | "settings";
type MemoView = "notebook" | "trash";
type MemoTemplate = {
  id: string;
  title: string;
  description: string;
  contentMarkdown: string;
  tags: string[];
};
type NotebookOption = {
  notebook: Notebook;
  depth: number;
};
type MobileNotebookSortMode = MobileNotebookSortPreference;
type MobileLocaleMode = MobileLocalePreference;
type TextSelection = {
  start: number;
  end: number;
};
type MarkdownAction = "heading" | "bold" | "italic" | "bullet" | "checklist" | "quote" | "code" | "link" | "horizontalRule";

export const WorkspaceScreen = () => {
  const { client, session, signOut } = useSession();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<MobileView>("notes");
  const [activeNotebookId, setActiveNotebookId] = useState<string>(ALL_NOTES_ID);
  const [memoView, setMemoView] = useState<MemoView>("notebook");
  const [memoFilterMode, setMemoFilterMode] = useState<MemoFilterMode>("all");
  const [memoSortMode, setMemoSortMode] = useState<MemoSortMode>("updated-desc");
  const [memoListDensity, setMemoListDensity] = useState<MobileMemoListDensity>("preview");
  const [notebookSortMode, setNotebookSortMode] = useState<MobileNotebookSortMode>("manual");
  const [localePreference, setLocalePreference] = useState<MobileLocaleMode>("system");
  const [imageCompressionEnabled, setImageCompressionEnabled] = useState(true);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [notesActionsOpen, setNotesActionsOpen] = useState(false);
  const [notebookPickerOpen, setNotebookPickerOpen] = useState(false);
  const [memoActionsMemo, setMemoActionsMemo] = useState<MemoSummary | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<MemoDetail | null>(null);
  const [richEditingMemo, setRichEditingMemo] = useState<MemoDetail | null>(null);
  const [notebookManagerOpen, setNotebookManagerOpen] = useState(false);
  const [tagsManagerOpen, setTagsManagerOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [apiTokensOpen, setApiTokensOpen] = useState(false);
  const [evernoteGuideOpen, setEvernoteGuideOpen] = useState(false);
  const [advancedPlayOpen, setAdvancedPlayOpen] = useState(false);
  const [systemInfoOpen, setSystemInfoOpen] = useState(false);
  const [syncQueueOpen, setSyncQueueOpen] = useState(false);
  const [revisionMemo, setRevisionMemo] = useState<MemoDetail | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMemoIds, setSelectedMemoIds] = useState<Set<string>>(() => new Set());
  const [selectionMoveOpen, setSelectionMoveOpen] = useState(false);
  const [syncQueueSummary, setSyncQueueSummary] = useState<MobileSyncQueueSummary>(() => emptyMobileSyncQueueSummary());
  const [syncQueueMessage, setSyncQueueMessage] = useState("");
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<string | null>(null);
  const autoSyncRunningRef = useRef(false);

  const notebooksQuery = useQuery({
    queryKey: ["mobile", "notebooks"],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listNotebooks();
    },
    enabled: Boolean(client),
  });

  const notebooks = notebooksQuery.data?.notebooks ?? [];
  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;

  const memosQuery = useQuery({
    queryKey: ["mobile", "memos", memoView, activeNotebookId, memoFilterMode, memoSortMode],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listMemos({
        notebookId: activeNotebookId === ALL_NOTES_ID ? null : activeNotebookId,
        filter: memoFilterMode,
        limit: 50,
        sort: memoSortMode,
        trash: memoView === "trash",
      });
    },
    enabled: Boolean(client),
  });

  const searchQuery = useQuery({
    queryKey: ["mobile", "search", searchText.trim()],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listMemos({
        q: searchText.trim(),
        limit: 50,
        sort: "updated-desc",
      });
    },
    enabled: Boolean(client && searchText.trim().length > 0),
  });

  const memoDetailQuery = useQuery({
    queryKey: ["mobile", "memo", memoView, selectedMemoId],
    queryFn: async () => {
      if (!client || !selectedMemoId) {
        throw new Error("Memo is not selected");
      }

      return client.getMemo(selectedMemoId, { includeDeleted: memoView === "trash" });
    },
    enabled: Boolean(client && selectedMemoId),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
    ]);
    setSyncQueueSummary(await loadMobileSyncQueueSummary());
  };

  const handleMemoPress = (memoId: string) => {
    if (selectionMode) {
      toggleSelectedMemo(memoId);
      return;
    }

    setSelectedMemoId(memoId);
  };

  const toggleSelectedMemo = (memoId: string) => {
    setSelectionMode(true);
    setSelectedMemoIds((current) => {
      const next = new Set(current);

      if (next.has(memoId)) {
        next.delete(memoId);
      } else {
        next.add(memoId);
      }

      return next;
    });
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedMemoIds(new Set());
    setSelectionMoveOpen(false);
  };

  const toggleVisibleSelection = () => {
    const visibleMemoIds = memos.map((memo) => memo.id);

    if (visibleMemoIds.length === 0) {
      return;
    }

    setSelectionMode(true);
    setSelectedMemoIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = visibleMemoIds.every((memoId) => next.has(memoId));

      for (const memoId of visibleMemoIds) {
        if (allVisibleSelected) {
          next.delete(memoId);
        } else {
          next.add(memoId);
        }
      }

      return next;
    });
  };

  const enterSelectionMode = () => {
    setSelectionMode(true);
  };

  const closeDetail = () => {
    setSelectedMemoId(null);
  };

  const closeRichEditor = () => {
    const memoId = richEditingMemo?.id ?? null;
    setRichEditingMemo(null);
    if (memoId) {
      setSelectedMemoId(memoId);
    }
    void invalidateWorkspace();
  };

  const memoCount = notebooks.reduce((total, notebook) => total + notebook.memoCount, 0);
  const memos = memosQuery.data?.memos ?? [];
  const searchResults = searchQuery.data?.memos ?? [];
  const selectedMemo = memoDetailQuery.data?.memo ?? null;
  const isRefreshing = notebooksQuery.isFetching || memosQuery.isFetching || searchQuery.isFetching || memoDetailQuery.isFetching;
  const selectedMemoIdList = Array.from(selectedMemoIds);
  const selectedMemos = memos.filter((memo) => selectedMemoIds.has(memo.id));
  const canToggleVisibleSelection = memos.length > 0;
  const allVisibleMemosSelected = canToggleVisibleSelection && memos.every((memo) => selectedMemoIds.has(memo.id));
  const nextSelectionPinValue = selectedMemos.some((memo) => !memo.isPinned);
  const selectedMemoIndex = selectedMemoId ? memos.findIndex((memo) => memo.id === selectedMemoId) : -1;
  const previousMemoId = selectedMemoIndex > 0 ? memos[selectedMemoIndex - 1]?.id : null;
  const nextMemoId = selectedMemoIndex >= 0 && selectedMemoIndex < memos.length - 1 ? memos[selectedMemoIndex + 1]?.id : null;

  useEffect(() => {
    clearSelection();
  }, [activeNotebookId, memoFilterMode, memoSortMode, memoView]);

  useEffect(() => {
    let mounted = true;

    loadMobileSyncQueueSummary().then((summary) => {
      if (mounted) {
        setSyncQueueSummary(summary);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    readMobileImageCompressionEnabled().then((enabled) => {
      if (mounted) {
        setImageCompressionEnabled(enabled);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    readMobileMemoListDensity().then((density) => {
      if (mounted) {
        setMemoListDensity(density);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    readMobileLocalePreference().then((locale) => {
      if (mounted) {
        setLocalePreference(locale);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    readMobileNotebookSort().then((sortMode) => {
      if (mounted) {
        setNotebookSortMode(sortMode);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleMemoListDensityChange = (density: MobileMemoListDensity) => {
    setMemoListDensity(density);
    void writeMobileMemoListDensity(density);
  };

  const handleNotebookSortModeChange = (sortMode: MobileNotebookSortMode) => {
    setNotebookSortMode(sortMode);
    void writeMobileNotebookSort(sortMode);
  };

  const handleLocalePreferenceChange = (locale: MobileLocaleMode) => {
    setLocalePreference(locale);
    void writeMobileLocalePreference(locale);
  };

  const handleImageCompressionChange = (enabled: boolean) => {
    setImageCompressionEnabled(enabled);
    void writeMobileImageCompressionEnabled(enabled);
  };

  const invalidateWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
    ]);
  };

  const updateMemoMutation = useMutation({
    mutationFn: async ({ memo, payload }: { memo: MemoDetail; payload: { title?: string; contentMarkdown?: string; isPinned?: boolean; notebookId?: string; tags?: string[] } }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const response = await client.updateMemo(memo.id, {
        expectedRevision: memo.revision,
        ...payload,
      });

      return response.memo;
    },
    onSuccess: async (memo) => {
      await invalidateWorkspace();
      queryClient.setQueryData(["mobile", "memo", memoView, memo.id], { memo });
    },
  });

  const deleteMemoMutation = useMutation({
    mutationFn: async ({ memo, permanent }: { memo: MemoDetail; permanent: boolean }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      await client.deleteMemo(memo.id, { permanent });
      return { memo, permanent };
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      setSelectedMemoId(null);
    },
  });

  const restoreMemoMutation = useMutation({
    mutationFn: async (memo: MemoDetail) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const response = await client.restoreMemo(memo.id);
      return response.memo;
    },
    onSuccess: async (memo) => {
      await invalidateWorkspace();
      setMemoView("notebook");
      setSelectedMemoId(memo.id);
    },
  });

  const restoreMemoByIdMutation = useMutation({
    mutationFn: async (memoId: string) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const response = await client.restoreMemo(memoId);
      return response.memo;
    },
    onSuccess: async (memo) => {
      await invalidateWorkspace();
      setMemoView("notebook");
      setSelectedMemoId(memo.id);
      setMemoActionsMemo(null);
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.emptyTrash();
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      setSelectedMemoId(null);
    },
  });

  const moveMemosMutation = useMutation({
    mutationFn: async ({ memoIds, notebookId }: { memoIds: string[]; notebookId: string }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.moveMemos({ memoIds, notebookId });
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      clearSelection();
    },
  });

  const pinMemosMutation = useMutation({
    mutationFn: async ({ memoIds, isPinned }: { memoIds: string[]; isPinned: boolean }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      await Promise.all(memoIds.map((memoId) => client.updateMemo(memoId, { isPinned })));
      return { ok: true };
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      clearSelection();
    },
  });

  const deleteMemosMutation = useMutation({
    mutationFn: async ({ memoIds, permanent }: { memoIds: string[]; permanent: boolean }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.deleteMemos({ memoIds, permanent });
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      clearSelection();
    },
  });

  const mergeMemosMutation = useMutation({
    mutationFn: async ({ memoIds, notebookId }: { memoIds: string[]; notebookId?: string }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const response = await client.mergeMemos({ memoIds, notebookId });
      return response.memo;
    },
    onSuccess: async (memo) => {
      await invalidateWorkspace();
      clearSelection();
      setSelectedMemoId(memo.id);
    },
  });

  const handleTogglePin = (memo: MemoDetail) => {
    updateMemoMutation.mutate({ memo, payload: { isPinned: !memo.isPinned } });
  };

  const handleDeleteMemo = (memo: MemoDetail) => {
    Alert.alert(memoView === "trash" ? "永久删除笔记？" : "删除笔记？", memoView === "trash" ? "此操作不可撤销。" : "笔记会移动到回收站。", [
      { text: "取消", style: "cancel" },
      {
        text: memoView === "trash" ? "永久删除" : "删除",
        style: "destructive",
        onPress: () => deleteMemoMutation.mutate({ memo, permanent: memoView === "trash" }),
      },
    ]);
  };

  const handleEmptyTrash = () => {
    Alert.alert("清空回收站？", "回收站中的笔记会被永久删除，此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "清空",
        style: "destructive",
        onPress: () => emptyTrashMutation.mutate(),
      },
    ]);
  };

  const handleDeleteSelection = () => {
    const permanent = memoView === "trash";

    Alert.alert(permanent ? "永久删除选中笔记？" : "删除选中笔记？", permanent ? "此操作不可撤销。" : "选中的笔记会移动到回收站。", [
      { text: "取消", style: "cancel" },
      {
        text: permanent ? "永久删除" : "删除",
        style: "destructive",
        onPress: () => deleteMemosMutation.mutate({ memoIds: selectedMemoIdList, permanent }),
      },
    ]);
  };

  const requestDeleteMemoSummary = (memo: MemoSummary) => {
    const permanent = memoView === "trash";

    Alert.alert(permanent ? "永久删除笔记？" : "删除笔记？", permanent ? "此操作不可撤销。" : "笔记会移动到回收站。", [
      { text: "取消", style: "cancel" },
      {
        text: permanent ? "永久删除" : "删除",
        style: "destructive",
        onPress: () => {
          setMemoActionsMemo(null);
          deleteMemosMutation.mutate({ memoIds: [memo.id], permanent });
        },
      },
    ]);
  };

  const selectSingleMemo = (memoId: string) => {
    setSelectionMode(true);
    setSelectedMemoIds(new Set([memoId]));
  };

  const handleMergeSelection = () => {
    if (selectedMemoIdList.length < 2) {
      return;
    }

    const targetNotebookId = activeNotebookId === ALL_NOTES_ID ? selectedMemos[0]?.notebookId : activeNotebookId;

    Alert.alert("合并选中笔记？", "服务端会把选中的笔记合并成一条新笔记。", [
      { text: "取消", style: "cancel" },
      {
        text: "合并",
        onPress: () => mergeMemosMutation.mutate({ memoIds: selectedMemoIdList, notebookId: targetNotebookId }),
      },
    ]);
  };

  const handleSyncQueuedChanges = async () => {
    if (!client || isSyncingQueue) {
      return;
    }

    setIsSyncingQueue(true);
    setSyncQueueMessage("");

    try {
      const result = await syncMobileQueuedChanges(client, {
        onSynced: async (memo) => {
          queryClient.setQueryData(["mobile", "memo", "notebook", memo.id], { memo });
          queryClient.setQueryData(["mobile", "memo", "trash", memo.id], { memo });
        },
      });
      await invalidateWorkspace();
      setSyncQueueSummary(await loadMobileSyncQueueSummary());
      setSyncQueueMessage(result.attempted === 0 ? "没有可同步的变更" : `已同步 ${result.synced} 条，失败 ${result.failed + result.conflicted} 条`);
    } catch (error) {
      setSyncQueueSummary(await loadMobileSyncQueueSummary());
      setSyncQueueMessage(error instanceof Error ? error.message : "同步失败");
    } finally {
      setIsSyncingQueue(false);
    }
  };

  const runAutomaticSync = async () => {
    if (!client || autoSyncRunningRef.current) {
      return;
    }

    autoSyncRunningRef.current = true;

    const summary = await loadMobileSyncQueueSummary();
    setSyncQueueSummary(summary);

    if (summary.pending + summary.error + summary.syncing === 0) {
      autoSyncRunningRef.current = false;
      return;
    }

    setIsSyncingQueue(true);
    setSyncQueueMessage("正在自动同步本地变更");

    try {
      const result = await syncMobileQueuedChanges(client, {
        onSynced: async (memo) => {
          queryClient.setQueryData(["mobile", "memo", "notebook", memo.id], { memo });
          queryClient.setQueryData(["mobile", "memo", "trash", memo.id], { memo });
        },
      });
      await invalidateWorkspace();
      setSyncQueueSummary(await loadMobileSyncQueueSummary());
      setLastAutoSyncAt(new Date().toISOString());
      setSyncQueueMessage(result.attempted === 0 ? "" : `自动同步完成：成功 ${result.synced} 条，失败 ${result.failed + result.conflicted} 条`);
    } catch (error) {
      setSyncQueueSummary(await loadMobileSyncQueueSummary());
      setSyncQueueMessage(error instanceof Error ? error.message : "自动同步失败");
    } finally {
      setIsSyncingQueue(false);
      autoSyncRunningRef.current = false;
    }
  };

  useEffect(() => {
    if (!client) {
      return;
    }

    void runAutomaticSync();

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void runAutomaticSync();
      }
    });

    return () => subscription.remove();
  }, [client, lastAutoSyncAt]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader instance={session?.baseUrl ?? ""} onRefresh={refresh} onSignOut={signOut} />

      {activeView === "notes" ? (
        <NotesView
          activeNotebook={activeNotebook}
          activeNotebookId={activeNotebookId}
          isLoading={memosQuery.isLoading}
          isRefreshing={isRefreshing}
          memoCount={memosQuery.data?.totalCount ?? memos.length}
          memoFilterMode={memoFilterMode}
          memoListDensity={memoListDensity}
          memoSortMode={memoSortMode}
          memoView={memoView}
          memos={memos}
          notebookSortMode={notebookSortMode}
          notebooks={notebooks}
          notebooksMemoCount={memoCount}
          onCreate={() => setCreateOpen(true)}
          onEmptyTrash={handleEmptyTrash}
          onFilterModeChange={setMemoFilterMode}
          onMemoListDensityChange={handleMemoListDensityChange}
          onOpenActions={() => setNotesActionsOpen(true)}
          onOpenNotebookPicker={() => setNotebookPickerOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onMemoPress={handleMemoPress}
          onMemoLongPress={(memo) => setMemoActionsMemo(memo)}
          onRefresh={refresh}
          onSelectNotebook={setActiveNotebookId}
          onSetMemoView={setMemoView}
          onSortModeChange={setMemoSortMode}
          selectionMode={selectionMode}
          selectedMemoIds={selectedMemoIds}
          error={memosQuery.error}
          isError={memosQuery.isError}
          isEmptyingTrash={emptyTrashMutation.isPending}
        />
      ) : null}

      {activeView === "search" ? (
        <SearchView
          isLoading={searchQuery.isFetching}
          isRefreshing={isRefreshing}
          onMemoPress={handleMemoPress}
          onRefresh={refresh}
          results={searchResults}
          searchText={searchText}
          setSearchText={setSearchText}
          totalCount={searchQuery.data?.totalCount ?? searchResults.length}
        />
      ) : null}

      {activeView === "account" ? <AccountView instance={session?.baseUrl ?? ""} userName={session?.user?.username ?? "owner"} onSignOut={signOut} /> : null}
      {activeView === "settings" ? (
        <SettingsView
          notebookCount={notebooks.length}
          memoCount={memoCount}
          onOpenAdvancedPlay={() => setAdvancedPlayOpen(true)}
          onOpenApiTokens={() => setApiTokensOpen(true)}
          onOpenEvernoteGuide={() => setEvernoteGuideOpen(true)}
          onOpenNotebookManager={() => setNotebookManagerOpen(true)}
          onOpenResources={() => setResourcesOpen(true)}
          onOpenSystemInfo={() => setSystemInfoOpen(true)}
          onOpenTagsManager={() => setTagsManagerOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenSyncQueue={() => setSyncQueueOpen(true)}
          onSyncQueuedChanges={handleSyncQueuedChanges}
          syncQueueMessage={syncQueueMessage}
          syncQueueSummary={syncQueueSummary}
          isSyncingQueue={isSyncingQueue}
          localePreference={localePreference}
          onLocalePreferenceChange={handleLocalePreferenceChange}
          imageCompressionEnabled={imageCompressionEnabled}
          onImageCompressionChange={handleImageCompressionChange}
        />
      ) : null}

      <MemoDetailModal
        isDeleting={deleteMemoMutation.isPending}
        isLoading={memoDetailQuery.isLoading}
        isRestoring={restoreMemoMutation.isPending}
        isSaving={updateMemoMutation.isPending}
        memo={selectedMemo}
        onClose={closeDetail}
        onDelete={handleDeleteMemo}
        onEdit={setEditingMemo}
        onRichEdit={setRichEditingMemo}
        onOpenNextMemo={nextMemoId ? () => setSelectedMemoId(nextMemoId) : undefined}
        onOpenPreviousMemo={previousMemoId ? () => setSelectedMemoId(previousMemoId) : undefined}
        onOpenResources={() => setResourcesOpen(true)}
        onOpenRevisions={setRevisionMemo}
        onRestore={(memo) => restoreMemoMutation.mutate(memo)}
        onTogglePin={handleTogglePin}
        visible={Boolean(selectedMemoId)}
      />

      <EditMemoModal
        memo={editingMemo}
        imageCompressionEnabled={imageCompressionEnabled}
        notebooks={notebooks}
        onClose={() => setEditingMemo(null)}
        onQueued={async () => {
          setEditingMemo(null);
          setSyncQueueSummary(await loadMobileSyncQueueSummary());
          setSyncQueueMessage("变更已保存到本地队列");
        }}
        onSaved={(memo) => {
          setEditingMemo(null);
          setSelectedMemoId(memo.id);
        }}
        updateMutation={updateMemoMutation}
      />
      <RichEditorModal baseUrl={session?.baseUrl ?? ""} memo={richEditingMemo} notebooks={notebooks} onClose={closeRichEditor} token={session?.token ?? ""} />
      <NotebookPickerModal
        activeNotebookId={activeNotebookId}
        notebookSortMode={notebookSortMode}
        notebooks={notebooks}
        notebooksMemoCount={memoCount}
        onClose={() => setNotebookPickerOpen(false)}
        onSelect={(notebookId) => {
          setActiveNotebookId(notebookId);
          setNotebookPickerOpen(false);
        }}
        visible={notebookPickerOpen}
      />

      <NotebookManagerModal
        notebookSortMode={notebookSortMode}
        notebooks={notebooks}
        onClose={() => setNotebookManagerOpen(false)}
        onSortModeChange={handleNotebookSortModeChange}
        visible={notebookManagerOpen}
      />
      <TagsManagerModal onClose={() => setTagsManagerOpen(false)} visible={tagsManagerOpen} />
      <ResourcesModal activeMemo={selectedMemo} imageCompressionEnabled={imageCompressionEnabled} onClose={() => setResourcesOpen(false)} visible={resourcesOpen} />
      <ApiTokensModal baseUrl={session?.baseUrl ?? ""} onClose={() => setApiTokensOpen(false)} visible={apiTokensOpen} />
      <EvernoteGuideModal onClose={() => setEvernoteGuideOpen(false)} visible={evernoteGuideOpen} />
      <AdvancedPlayModal onClose={() => setAdvancedPlayOpen(false)} visible={advancedPlayOpen} />
      <SyncQueueModal
        onClose={() => setSyncQueueOpen(false)}
        onChanged={async () => setSyncQueueSummary(await loadMobileSyncQueueSummary())}
        onSync={handleSyncQueuedChanges}
        visible={syncQueueOpen}
      />
      <SystemInfoModal baseUrl={session?.baseUrl ?? ""} memoCount={memoCount} notebookCount={notebooks.length} onClose={() => setSystemInfoOpen(false)} visible={systemInfoOpen} />
      <RevisionHistoryModal
        memo={revisionMemo}
        onClose={() => setRevisionMemo(null)}
        onRestored={(memo) => {
          setRevisionMemo(null);
          setSelectedMemoId(memo.id);
        }}
      />

      <CreateMemoModal
        activeNotebookId={activeNotebookId}
        notebooks={notebooks}
        onClose={() => setCreateOpen(false)}
        onCreated={(memo) => {
          setCreateOpen(false);
          setActiveView("notes");
          setMemoView("notebook");
          setActiveNotebookId(memo.notebookId);
          setSelectedMemoId(null);
          setRichEditingMemo(memo);
        }}
        visible={createOpen}
      />

      <TemplatesModal
        activeNotebookId={activeNotebookId}
        notebooks={notebooks}
        onClose={() => setTemplatesOpen(false)}
        onCreated={(memo) => {
          setTemplatesOpen(false);
          setActiveView("notes");
          setMemoView("notebook");
          setActiveNotebookId(memo.notebookId);
          setSelectedMemoId(null);
          setRichEditingMemo(memo);
        }}
        visible={templatesOpen}
      />

      <MoveSelectionModal
        isMoving={moveMemosMutation.isPending}
        notebooks={notebooks}
        onClose={() => setSelectionMoveOpen(false)}
        onMove={(notebookId) => moveMemosMutation.mutate({ memoIds: selectedMemoIdList, notebookId })}
        selectedCount={selectedMemoIds.size}
        visible={selectionMoveOpen}
      />

      <NotesActionsModal
        memoListDensity={memoListDensity}
        memoSortMode={memoSortMode}
        memoView={memoView}
        isEmptyingTrash={emptyTrashMutation.isPending}
        onClose={() => setNotesActionsOpen(false)}
        onEnterSelection={() => {
          setNotesActionsOpen(false);
          enterSelectionMode();
        }}
        onEmptyTrash={() => {
          setNotesActionsOpen(false);
          handleEmptyTrash();
        }}
        onOpenApiTokens={() => {
          setNotesActionsOpen(false);
          setApiTokensOpen(true);
        }}
        onOpenResources={() => {
          setNotesActionsOpen(false);
          setResourcesOpen(true);
        }}
        onOpenTags={() => {
          setNotesActionsOpen(false);
          setTagsManagerOpen(true);
        }}
        onMemoListDensityChange={handleMemoListDensityChange}
        onSortModeChange={setMemoSortMode}
        onToggleTrash={() => {
          setNotesActionsOpen(false);
          setMemoView(memoView === "trash" ? "notebook" : "trash");
        }}
        visible={notesActionsOpen}
      />

      <MemoActionsModal
        isBusy={deleteMemosMutation.isPending || pinMemosMutation.isPending || restoreMemoByIdMutation.isPending}
        memo={memoActionsMemo}
        memoView={memoView}
        onClose={() => setMemoActionsMemo(null)}
        onDelete={requestDeleteMemoSummary}
        onMove={(memo) => {
          setMemoActionsMemo(null);
          selectSingleMemo(memo.id);
          setSelectionMoveOpen(true);
        }}
        onOpen={(memo) => {
          setMemoActionsMemo(null);
          setSelectedMemoId(memo.id);
        }}
        onRestore={(memo) => restoreMemoByIdMutation.mutate(memo.id)}
        onSelect={(memo) => {
          setMemoActionsMemo(null);
          selectSingleMemo(memo.id);
        }}
        onTogglePin={(memo) => {
          setMemoActionsMemo(null);
          pinMemosMutation.mutate({ memoIds: [memo.id], isPinned: !memo.isPinned });
        }}
      />

      {activeView === "notes" && selectionMode ? (
        <SelectionActionBar
          canMerge={memoView !== "trash" && selectedMemoIds.size >= 2}
          canMove={memoView !== "trash" && selectedMemoIds.size > 0}
          isBusy={deleteMemosMutation.isPending || moveMemosMutation.isPending || pinMemosMutation.isPending || mergeMemosMutation.isPending}
          isTrashView={memoView === "trash"}
          onToggleVisibleSelection={toggleVisibleSelection}
          onClear={clearSelection}
          onDelete={handleDeleteSelection}
          onMerge={handleMergeSelection}
          onMove={() => setSelectionMoveOpen(true)}
          onPin={() => pinMemosMutation.mutate({ memoIds: selectedMemoIdList, isPinned: nextSelectionPinValue })}
          pinLabel={nextSelectionPinValue ? "置顶" : "取消置顶"}
          selectionToggleDisabled={!canToggleVisibleSelection}
          selectionToggleLabel={allVisibleMemosSelected ? "取消当前列表" : "选择当前列表"}
          selectedCount={selectedMemoIds.size}
        />
      ) : null}

      <View style={styles.bottomNav}>
        <BottomNavItem
          active={activeView === "notes"}
          icon={<Home color={activeView === "notes" ? "#0f172a" : "#64748b"} size={20} />}
          label="笔记"
          onPress={() => setActiveView("notes")}
        />
        <BottomNavItem
          active={activeView === "search"}
          icon={<Search color={activeView === "search" ? "#0f172a" : "#64748b"} size={20} />}
          label="搜索"
          onPress={() => setActiveView("search")}
        />
        <BottomNavItem
          active={activeView === "account"}
          icon={<UserRound color={activeView === "account" ? "#0f172a" : "#64748b"} size={20} />}
          label="账户"
          onPress={() => setActiveView("account")}
        />
        <BottomNavItem
          active={activeView === "settings"}
          icon={<Settings color={activeView === "settings" ? "#0f172a" : "#64748b"} size={20} />}
          label="设置"
          onPress={() => setActiveView("settings")}
        />
      </View>
    </SafeAreaView>
  );
};

const AppHeader = ({ instance, onRefresh, onSignOut }: { instance: string; onRefresh: () => void; onSignOut: () => void }) => (
  <View style={styles.header}>
    <View>
      <Text style={styles.title}>EdgeEver</Text>
      <Text numberOfLines={1} style={styles.instance}>
        {instance}
      </Text>
    </View>

    <View style={styles.headerActions}>
      <IconButton onPress={onRefresh}>
        <RefreshCw color="#0f172a" size={18} />
      </IconButton>
      <IconButton onPress={onSignOut}>
        <LogOut color="#0f172a" size={18} />
      </IconButton>
    </View>
  </View>
);

const NotesView = ({
  activeNotebook,
  activeNotebookId,
  error,
  isError,
  isLoading,
  isRefreshing,
  memoCount,
  memoFilterMode,
  memoListDensity,
  memoSortMode,
  memoView,
  memos,
  notebookSortMode,
  notebooks,
  notebooksMemoCount,
  onCreate,
  onEmptyTrash,
  onFilterModeChange,
  onMemoListDensityChange,
  onOpenActions,
  onOpenNotebookPicker,
  onMemoLongPress,
  onMemoPress,
  onOpenTemplates,
  onRefresh,
  onSelectNotebook,
  onSetMemoView,
  onSortModeChange,
  selectedMemoIds,
  selectionMode,
  isEmptyingTrash,
}: {
  activeNotebook: Notebook | null;
  activeNotebookId: string;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  memoCount: number;
  memoFilterMode: MemoFilterMode;
  memoListDensity: MobileMemoListDensity;
  memoSortMode: MemoSortMode;
  memoView: MemoView;
  memos: MemoSummary[];
  notebookSortMode: MobileNotebookSortMode;
  notebooks: Notebook[];
  notebooksMemoCount: number;
  onCreate: () => void;
  onEmptyTrash: () => void;
  onFilterModeChange: (filterMode: MemoFilterMode) => void;
  onMemoListDensityChange: (density: MobileMemoListDensity) => void;
  onOpenActions: () => void;
  onOpenNotebookPicker: () => void;
  onMemoLongPress: (memo: MemoSummary) => void;
  onMemoPress: (memoId: string) => void;
  onOpenTemplates: () => void;
  onRefresh: () => void;
  onSelectNotebook: (notebookId: string) => void;
  onSetMemoView: (memoView: MemoView) => void;
  onSortModeChange: (sortMode: MemoSortMode) => void;
  selectionMode: boolean;
  selectedMemoIds: Set<string>;
  isEmptyingTrash: boolean;
}) => (
  <View style={styles.viewBody}>
    {memoView === "notebook" ? (
      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <NotebookPill active={activeNotebookId === ALL_NOTES_ID} label="全部笔记" memoCount={notebooksMemoCount} onPress={() => onSelectNotebook(ALL_NOTES_ID)} />
          {flattenNotebooks(notebooks, notebookSortMode).map(({ depth, notebook }) => (
            <NotebookPill
              active={activeNotebookId === notebook.id}
              key={notebook.id}
              label={`${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${notebook.name}`}
              memoCount={notebook.memoCount}
              onPress={() => onSelectNotebook(notebook.id)}
            />
          ))}
        </ScrollView>
      </View>
    ) : null}

    <View style={styles.contentHeader}>
      <View>
        <Text style={styles.sectionTitle}>{memoView === "trash" ? "回收站" : activeNotebook?.name ?? "全部笔记"}</Text>
        <Text style={styles.sectionSubtitle}>{memoCount} 条笔记</Text>
      </View>
      <View style={styles.contentActions}>
        {memoView === "notebook" ? (
          <Pressable accessibilityRole="button" onPress={onOpenNotebookPicker} style={styles.secondaryIconButton}>
            <Folder color="#0f172a" size={18} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onOpenActions} style={styles.secondaryIconButton}>
          <MoreHorizontal color="#0f172a" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onSetMemoView(memoView === "trash" ? "notebook" : "trash")} style={styles.secondaryIconButton}>
          {memoView === "trash" ? <BookOpen color="#0f172a" size={18} /> : <Trash2 color="#0f172a" size={18} />}
        </Pressable>
        {memoView === "notebook" ? (
          <>
            <Pressable accessibilityRole="button" onPress={onOpenTemplates} style={styles.secondaryIconButton}>
              <FileText color="#0f172a" size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onCreate} style={styles.primaryIconButton}>
              <Plus color="#ffffff" size={20} />
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={isEmptyingTrash || memoCount === 0}
            onPress={onEmptyTrash}
            style={[styles.dangerIconButton, (isEmptyingTrash || memoCount === 0) && styles.buttonDisabled]}
          >
            <Trash2 color="#b91c1c" size={18} />
          </Pressable>
        )}
      </View>
    </View>

    {memoView === "notebook" ? (
      <View style={styles.listControls}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <OptionPill active={memoFilterMode === "all"} label="全部" onPress={() => onFilterModeChange("all")} />
          <OptionPill active={memoFilterMode === "pinned"} label="置顶" onPress={() => onFilterModeChange(memoFilterMode === "pinned" ? "all" : "pinned")} />
          <OptionPill active={memoFilterMode === "tagged"} label="有标签" onPress={() => onFilterModeChange(memoFilterMode === "tagged" ? "all" : "tagged")} />
          <OptionPill active={memoFilterMode === "untagged"} label="无标签" onPress={() => onFilterModeChange(memoFilterMode === "untagged" ? "all" : "untagged")} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <OptionPill active={memoSortMode === "updated-desc"} label="最近更新" onPress={() => onSortModeChange("updated-desc")} />
          <OptionPill active={memoSortMode === "created-desc"} label="创建时间" onPress={() => onSortModeChange("created-desc")} />
          <OptionPill active={memoSortMode === "title-asc"} label="标题 A-Z" onPress={() => onSortModeChange("title-asc")} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <OptionPill active={memoListDensity === "preview"} label="预览" onPress={() => onMemoListDensityChange("preview")} />
          <OptionPill active={memoListDensity === "compact"} label="紧凑" onPress={() => onMemoListDensityChange("compact")} />
        </ScrollView>
      </View>
    ) : null}

    <MemoList
      emptyDescription={memoView === "trash" ? "删除的笔记会出现在这里" : "点右上角按钮创建第一条笔记"}
      emptyTitle={memoView === "trash" ? "回收站为空" : "暂无笔记"}
      error={error}
      isError={isError}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      listDensity={memoListDensity}
      memos={memos}
      onMemoLongPress={onMemoLongPress}
      onMemoPress={onMemoPress}
      onRefresh={onRefresh}
      selectionMode={selectionMode}
      selectedMemoIds={selectedMemoIds}
    />
  </View>
);

const NotesActionsModal = ({
  isEmptyingTrash,
  memoListDensity,
  memoSortMode,
  memoView,
  onClose,
  onEmptyTrash,
  onEnterSelection,
  onMemoListDensityChange,
  onOpenApiTokens,
  onOpenResources,
  onOpenTags,
  onSortModeChange,
  onToggleTrash,
  visible,
}: {
  isEmptyingTrash: boolean;
  memoListDensity: MobileMemoListDensity;
  memoSortMode: MemoSortMode;
  memoView: MemoView;
  onClose: () => void;
  onEmptyTrash: () => void;
  onEnterSelection: () => void;
  onMemoListDensityChange: (density: MobileMemoListDensity) => void;
  onOpenApiTokens: () => void;
  onOpenResources: () => void;
  onOpenTags: () => void;
  onSortModeChange: (sortMode: MemoSortMode) => void;
  onToggleTrash: () => void;
  visible: boolean;
}) => (
  <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
    <Pressable onPress={onClose} style={styles.actionSheetBackdrop}>
      <Pressable style={styles.actionSheet}>
        <View style={styles.actionSheetHandle} />
        <Text style={styles.actionSheetTitle}>列表操作</Text>
        <ActionSheetItem icon={<CheckSquare color="#0f172a" size={18} />} label="选择笔记" onPress={onEnterSelection} />
        <Text style={styles.actionSheetSectionTitle}>显示模式</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <OptionPill active={memoListDensity === "preview"} label="预览" onPress={() => onMemoListDensityChange("preview")} />
          <OptionPill active={memoListDensity === "compact"} label="紧凑" onPress={() => onMemoListDensityChange("compact")} />
        </ScrollView>
        <Text style={styles.actionSheetSectionTitle}>排序方式</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <OptionPill active={memoSortMode === "updated-desc"} label="最近更新" onPress={() => onSortModeChange("updated-desc")} />
          <OptionPill active={memoSortMode === "created-desc"} label="创建时间" onPress={() => onSortModeChange("created-desc")} />
          <OptionPill active={memoSortMode === "title-asc"} label="标题 A-Z" onPress={() => onSortModeChange("title-asc")} />
        </ScrollView>
        <ActionSheetItem icon={<Tag color="#0f172a" size={18} />} label="标签管理" onPress={onOpenTags} />
        <ActionSheetItem icon={<Archive color="#0f172a" size={18} />} label="资源库" onPress={onOpenResources} />
        {memoView === "trash" ? (
          <>
            <ActionSheetItem icon={<BookOpen color="#0f172a" size={18} />} label="返回笔记列表" onPress={onToggleTrash} />
            <ActionSheetItem danger disabled={isEmptyingTrash} icon={<Trash2 color="#b91c1c" size={18} />} label={isEmptyingTrash ? "清空中" : "清空回收站"} onPress={onEmptyTrash} />
          </>
        ) : (
          <ActionSheetItem icon={<Trash2 color="#b91c1c" size={18} />} label="回收站" onPress={onToggleTrash} />
        )}
        <ActionSheetItem icon={<KeyRound color="#0f172a" size={18} />} label="MCP Token" onPress={onOpenApiTokens} />
      </Pressable>
    </Pressable>
  </Modal>
);

const NotebookPickerModal = ({
  activeNotebookId,
  notebookSortMode,
  notebooks,
  notebooksMemoCount,
  onClose,
  onSelect,
  visible,
}: {
  activeNotebookId: string;
  notebookSortMode: MobileNotebookSortMode;
  notebooks: Notebook[];
  notebooksMemoCount: number;
  onClose: () => void;
  onSelect: (notebookId: string) => void;
  visible: boolean;
}) => {
  const [searchText, setSearchText] = useState("");
  const [collapsedNotebookIds, setCollapsedNotebookIds] = useState<Set<string>>(() => new Set());
  const notebookOptions = flattenNotebooks(notebooks, notebookSortMode);
  const searchQuery = searchText.trim();
  const childNotebookIds = getNotebookParentIdSet(notebooks);
  const visibleNotebookOptions = searchQuery
    ? filterNotebookOptions(notebookOptions, searchText)
    : filterCollapsedNotebookOptions(notebookOptions, collapsedNotebookIds);

  useEffect(() => {
    if (visible) {
      setSearchText("");
    }
  }, [visible]);

  const toggleNotebookCollapsed = (notebookId: string) => {
    setCollapsedNotebookIds((current) => {
      const next = new Set(current);

      if (next.has(notebookId)) {
        next.delete(notebookId);
      } else {
        next.add(notebookId);
      }

      return next;
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>选择笔记本</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <View style={styles.searchBox}>
            <Search color="#64748b" size={18} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSearchText}
              placeholder="搜索笔记本"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              value={searchText}
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText("")}>
                <X color="#64748b" size={18} />
              </Pressable>
            ) : null}
          </View>

          <Pressable onPress={() => onSelect(ALL_NOTES_ID)} style={[styles.moveNotebookRow, activeNotebookId === ALL_NOTES_ID && styles.moveNotebookRowActive]}>
            <View style={styles.moveNotebookText}>
              <Text numberOfLines={1} style={styles.panelValue}>
                全部笔记
              </Text>
              <Text style={styles.panelLabel}>{notebooksMemoCount} 条笔记</Text>
            </View>
            {activeNotebookId === ALL_NOTES_ID ? <Check color="#0f172a" size={18} /> : null}
          </Pressable>

          <Text style={styles.label}>{searchQuery ? "匹配的笔记本" : "笔记本"}</Text>
          {visibleNotebookOptions.map(({ depth, notebook }) => (
            <View
              key={notebook.id}
              style={[styles.moveNotebookRow, activeNotebookId === notebook.id && styles.moveNotebookRowActive, depth > 0 && { marginLeft: Math.min(depth * 14, 42) }]}
            >
              {childNotebookIds.has(notebook.id) && !searchQuery ? (
                <Pressable accessibilityRole="button" onPress={() => toggleNotebookCollapsed(notebook.id)} style={styles.notebookTreeToggle}>
                  {collapsedNotebookIds.has(notebook.id) ? <ChevronRight color="#64748b" size={17} /> : <ChevronDown color="#64748b" size={17} />}
                </Pressable>
              ) : (
                <View style={styles.notebookTreeTogglePlaceholder} />
              )}
              <Pressable onPress={() => onSelect(notebook.id)} style={styles.moveNotebookSelectArea}>
                <Text numberOfLines={1} style={styles.panelValue}>
                  {depth > 0 ? `${"· ".repeat(depth)}${notebook.name}` : notebook.name}
                </Text>
                <Text style={styles.panelLabel}>{notebook.memoCount} 条笔记</Text>
              </Pressable>
              {activeNotebookId === notebook.id ? <Check color="#0f172a" size={18} /> : null}
            </View>
          ))}
          {visibleNotebookOptions.length === 0 ? (
            <View style={styles.emptyInlinePanel}>
              <Folder color="#94a3b8" size={28} />
              <Text style={styles.mutedText}>没有匹配的笔记本</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const MemoActionsModal = ({
  isBusy,
  memo,
  memoView,
  onClose,
  onDelete,
  onMove,
  onOpen,
  onRestore,
  onSelect,
  onTogglePin,
}: {
  isBusy: boolean;
  memo: MemoSummary | null;
  memoView: MemoView;
  onClose: () => void;
  onDelete: (memo: MemoSummary) => void;
  onMove: (memo: MemoSummary) => void;
  onOpen: (memo: MemoSummary) => void;
  onRestore: (memo: MemoSummary) => void;
  onSelect: (memo: MemoSummary) => void;
  onTogglePin: (memo: MemoSummary) => void;
}) => (
  <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(memo)}>
    <Pressable onPress={onClose} style={styles.actionSheetBackdrop}>
      <Pressable style={styles.actionSheet}>
        <View style={styles.actionSheetHandle} />
        <Text numberOfLines={1} style={styles.actionSheetTitle}>
          {memo?.title?.trim() || DEFAULT_MEMO_TITLE}
        </Text>
        {memo ? (
          <>
            <ActionSheetItem disabled={isBusy} icon={<FileText color="#0f172a" size={18} />} label="打开笔记" onPress={() => onOpen(memo)} />
            <ActionSheetItem disabled={isBusy} icon={<CheckSquare color="#0f172a" size={18} />} label="选择笔记" onPress={() => onSelect(memo)} />
            {memoView === "trash" ? (
              <>
                <ActionSheetItem disabled={isBusy} icon={<RotateCcw color="#0f172a" size={18} />} label="恢复笔记" onPress={() => onRestore(memo)} />
                <ActionSheetItem danger disabled={isBusy} icon={<Trash2 color="#b91c1c" size={18} />} label="永久删除" onPress={() => onDelete(memo)} />
              </>
            ) : (
              <>
                <ActionSheetItem disabled={isBusy} icon={<Folder color="#0f172a" size={18} />} label="移动到笔记本" onPress={() => onMove(memo)} />
                <ActionSheetItem disabled={isBusy} icon={<Pin color="#0f172a" size={18} />} label={memo.isPinned ? "取消置顶" : "置顶"} onPress={() => onTogglePin(memo)} />
                <ActionSheetItem danger disabled={isBusy} icon={<Trash2 color="#b91c1c" size={18} />} label="删除笔记" onPress={() => onDelete(memo)} />
              </>
            )}
          </>
        ) : null}
      </Pressable>
    </Pressable>
  </Modal>
);

const ActionSheetItem = ({ danger = false, disabled = false, icon, label, onPress }: { danger?: boolean; disabled?: boolean; icon: ReactNode; label: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionSheetItem, disabled && styles.buttonDisabled]}>
    {icon}
    <Text style={[styles.actionSheetItemText, danger && styles.actionSheetItemTextDanger]}>{label}</Text>
  </Pressable>
);

const SearchView = ({
  isLoading,
  isRefreshing,
  onMemoPress,
  onRefresh,
  results,
  searchText,
  setSearchText,
  totalCount,
}: {
  isLoading: boolean;
  isRefreshing: boolean;
  onMemoPress: (memoId: string) => void;
  onRefresh: () => void;
  results: MemoSummary[];
  searchText: string;
  setSearchText: (value: string) => void;
  totalCount: number;
}) => (
  <View style={styles.viewBody}>
    <View style={styles.searchHeader}>
      <Text style={styles.sectionTitle}>搜索</Text>
      <View style={styles.searchBox}>
        <Search color="#64748b" size={18} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchText}
          placeholder="搜索标题、正文或标签"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={searchText}
        />
        {searchText ? (
          <Pressable onPress={() => setSearchText("")}>
            <X color="#64748b" size={18} />
          </Pressable>
        ) : null}
      </View>
      {searchText.trim() ? <Text style={styles.sectionSubtitle}>{totalCount} 条结果</Text> : null}
    </View>

    {searchText.trim() ? (
      <MemoList
        emptyDescription="换个关键词再试"
        emptyTitle="没有找到匹配笔记"
        isError={false}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        listDensity="preview"
        memos={results}
        onMemoPress={onMemoPress}
        onRefresh={onRefresh}
      />
    ) : (
      <View style={styles.centerState}>
        <Search color="#94a3b8" size={32} />
        <Text style={styles.emptyTitle}>输入关键词开始搜索</Text>
        <Text style={styles.mutedText}>搜索会请求你的 EdgeEver 实例</Text>
      </View>
    )}
  </View>
);

const AccountView = ({ instance, userName, onSignOut }: { instance: string; userName: string; onSignOut: () => void }) => (
  <ScrollView contentContainerStyle={styles.panelList} style={styles.viewBody}>
    <Text style={styles.sectionTitle}>账户</Text>
    <PanelRow label="当前用户" value={userName} />
    <PanelRow label="实例地址" value={instance} />
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(GITHUB_REPOSITORY_URL)} style={[styles.panelRow, styles.panelLinkRow]}>
      <View style={styles.panelLinkText}>
        <Text style={styles.panelLabel}>GitHub 仓库</Text>
        <Text style={styles.panelValue}>tianma-if/edgeever</Text>
      </View>
      <ExternalLink color="#0f172a" size={18} />
    </Pressable>
    <Pressable onPress={onSignOut} style={styles.dangerButton}>
      <LogOut color="#b91c1c" size={18} />
      <Text style={styles.dangerButtonText}>退出登录</Text>
    </Pressable>
  </ScrollView>
);

const SettingsView = ({
  imageCompressionEnabled,
  isSyncingQueue,
  localePreference,
  memoCount,
  notebookCount,
  onImageCompressionChange,
  onLocalePreferenceChange,
  onOpenAdvancedPlay,
  onOpenApiTokens,
  onOpenEvernoteGuide,
  onOpenNotebookManager,
  onOpenResources,
  onOpenSystemInfo,
  onOpenSyncQueue,
  onOpenTagsManager,
  onOpenTemplates,
  onSyncQueuedChanges,
  syncQueueMessage,
  syncQueueSummary,
}: {
  imageCompressionEnabled: boolean;
  isSyncingQueue: boolean;
  localePreference: MobileLocaleMode;
  memoCount: number;
  notebookCount: number;
  onImageCompressionChange: (enabled: boolean) => void;
  onLocalePreferenceChange: (locale: MobileLocaleMode) => void;
  onOpenAdvancedPlay: () => void;
  onOpenApiTokens: () => void;
  onOpenEvernoteGuide: () => void;
  onOpenNotebookManager: () => void;
  onOpenResources: () => void;
  onOpenSystemInfo: () => void;
  onOpenSyncQueue: () => void;
  onOpenTagsManager: () => void;
  onOpenTemplates: () => void;
  onSyncQueuedChanges: () => void;
  syncQueueMessage: string;
  syncQueueSummary: MobileSyncQueueSummary;
}) => (
  <ScrollView contentContainerStyle={styles.panelList} style={styles.viewBody}>
    <Text style={styles.sectionTitle}>设置</Text>
    <Pressable onPress={onOpenNotebookManager}>
      <PanelRow label="笔记本管理" value="创建、重命名、删除" />
    </Pressable>
    <Pressable onPress={onOpenTagsManager}>
      <PanelRow label="标签管理" value="重命名、删除标签" />
    </Pressable>
    <Pressable onPress={onOpenResources}>
      <PanelRow label="资源库" value="图片、附件、来源笔记" />
    </Pressable>
    <Pressable onPress={onOpenTemplates}>
      <PanelRow label="模板" value="速记、会议、清单、读书、复盘" />
    </Pressable>
    <Pressable onPress={onOpenApiTokens}>
      <PanelRow label="MCP 与 API Token" value="创建、复制、撤销 Token" />
    </Pressable>
    <Pressable onPress={onOpenEvernoteGuide}>
      <PanelRow label="Evernote 导入指引" value="MCP 迁移流程与 Prompt" />
    </Pressable>
    <Pressable onPress={onOpenAdvancedPlay}>
      <PanelRow label="进阶玩法" value="人物画像、知识图谱、标签建议 Prompt" />
    </Pressable>
    <Pressable onPress={onOpenSystemInfo}>
      <PanelRow label="系统信息" value="版本、平台、实例、统计" />
    </Pressable>
    <PanelRow label="移动端形态" value="React Native" />
    <PanelRow label="笔记本数量" value={String(notebookCount)} />
    <PanelRow label="笔记总数" value={String(memoCount)} />
    <View style={styles.panelRow}>
      <View style={styles.preferenceStack}>
        <View style={styles.preferenceText}>
          <Text style={styles.panelLabel}>语言偏好</Text>
          <Text style={styles.panelValue}>{getMobileLocalePreferenceLabel(localePreference)}</Text>
          <Text style={styles.panelHint}>与 PWA 设置保持一致，可选择跟随系统、简体中文或 English。</Text>
        </View>
        <View style={styles.scopeGrid}>
          {MOBILE_LOCALE_OPTIONS.map((option) => {
            const selected = localePreference === option.value;

            return (
              <Pressable key={option.value} onPress={() => onLocalePreferenceChange(option.value)} style={[styles.scopePill, selected && styles.scopePillActive]}>
                <Text style={[styles.scopePillText, selected && styles.scopePillTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
    <View style={styles.panelRow}>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceText}>
          <Text style={styles.panelLabel}>图片上传压缩</Text>
          <Text style={styles.panelValue}>{imageCompressionEnabled ? "已开启" : "已关闭"}</Text>
          <Text style={styles.panelHint}>开启后会把支持的图片压缩为 WebP，降低移动网络和存储占用。</Text>
        </View>
        <Switch onValueChange={onImageCompressionChange} value={imageCompressionEnabled} />
      </View>
    </View>
    <SyncQueuePanel isSyncing={isSyncingQueue} message={syncQueueMessage} onOpen={onOpenSyncQueue} onSync={onSyncQueuedChanges} summary={syncQueueSummary} />
    <PanelRow label="富文本编辑器" value="已接入 PWA TipTap WebView" />
  </ScrollView>
);

const CreateMemoModal = ({
  activeNotebookId,
  notebooks,
  onClose,
  onCreated,
  visible,
}: {
  activeNotebookId: string;
  notebooks: Notebook[];
  onClose: () => void;
  onCreated: (memo: MemoDetail) => void;
  visible: boolean;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const fallbackNotebookId = activeNotebookId !== ALL_NOTES_ID ? activeNotebookId : notebooks[0]?.id ?? "";
  const [notebookId, setNotebookId] = useState(fallbackNotebookId);
  const [title, setTitle] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [insertTextOpen, setInsertTextOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setNotebookId(fallbackNotebookId);
    }
  }, [fallbackNotebookId, visible]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const targetNotebookId = notebookId || fallbackNotebookId;

      if (!targetNotebookId) {
        throw new Error("请先创建一个笔记本");
      }

      const response = await client.createMemo({
        notebookId: targetNotebookId,
        title: title.trim() || DEFAULT_MEMO_TITLE,
        tags: parseTags(tagsText),
        contentMarkdown: contentMarkdown.trim(),
      });

      return response.memo;
    },
    onSuccess: async (memo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      ]);
      setTitle("");
      setTagsText("");
      setContentMarkdown("");
      onCreated(memo);
    },
  });

  const pasteClipboardText = async () => {
    const text = await Clipboard.getStringAsync();

    if (!text.trim()) {
      return;
    }

    const next = insertPlainText(contentMarkdown, contentSelection, text);
    setContentMarkdown(next.value);
    setContentSelection(next.selection);
  };

  const insertManualText = (text: string) => {
    const next = insertPlainText(contentMarkdown, contentSelection, text);
    setContentMarkdown(next.value);
    setContentSelection(next.selection);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>新建笔记</Text>
          <IconButton onPress={() => createMutation.mutate()}>
            {createMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={20} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.label}>笔记本</Text>
          <NotebookPicker notebooks={notebooks} onChange={setNotebookId} selectedNotebookId={notebookId || fallbackNotebookId} />

          <Text style={styles.label}>标题</Text>
          <TextInput onChangeText={setTitle} placeholder={DEFAULT_MEMO_TITLE} placeholderTextColor="#94a3b8" style={styles.titleInput} value={title} />

          <Text style={styles.label}>标签</Text>
          <TextInput onChangeText={setTagsText} placeholder="用逗号分隔标签" placeholderTextColor="#94a3b8" style={styles.titleInput} value={tagsText} />

          <Text style={styles.label}>正文</Text>
          <MarkdownToolbar
            onAction={(action) => {
              const next = applyMarkdownAction(contentMarkdown, contentSelection, action);
              setContentMarkdown(next.value);
              setContentSelection(next.selection);
            }}
            onInsertText={() => setInsertTextOpen(true)}
            onPasteText={() => void pasteClipboardText()}
          />
          <TextInput
            multiline
            onChangeText={setContentMarkdown}
            onSelectionChange={(event) => setContentSelection(event.nativeEvent.selection)}
            placeholder="输入正文，可用上方工具插入 Markdown 格式"
            placeholderTextColor="#94a3b8"
            selection={contentSelection}
            style={styles.markdownInput}
            textAlignVertical="top"
            value={contentMarkdown}
          />

          {createMutation.error ? (
            <Text style={styles.errorText}>{createMutation.error instanceof Error ? createMutation.error.message : "创建失败"}</Text>
          ) : null}
        </ScrollView>
        <InsertTextModal onClose={() => setInsertTextOpen(false)} onInsert={insertManualText} visible={insertTextOpen} />
      </SafeAreaView>
    </Modal>
  );
};

const TemplatesModal = ({
  activeNotebookId,
  notebooks,
  onClose,
  onCreated,
  visible,
}: {
  activeNotebookId: string;
  notebooks: Notebook[];
  onClose: () => void;
  onCreated: (memo: MemoDetail) => void;
  visible: boolean;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const fallbackNotebookId = activeNotebookId !== ALL_NOTES_ID ? activeNotebookId : notebooks[0]?.id ?? "";
  const [targetNotebookId, setTargetNotebookId] = useState(fallbackNotebookId);

  useEffect(() => {
    if (visible) {
      setTargetNotebookId(fallbackNotebookId);
    }
  }, [fallbackNotebookId, visible]);

  const createFromTemplateMutation = useMutation({
    mutationFn: async (template: MemoTemplate) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      if (!targetNotebookId) {
        throw new Error("请先创建一个笔记本");
      }

      const response = await client.createMemo({
        notebookId: targetNotebookId,
        title: template.title,
        contentMarkdown: template.contentMarkdown,
        tags: template.tags,
      });

      return response.memo;
    },
    onSuccess: async (memo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "tags"] }),
      ]);
      onCreated(memo);
    },
  });

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>模板</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.sectionSubtitle}>选择一个模板，直接创建新笔记。</Text>
          <Text style={styles.label}>目标笔记本</Text>
          <NotebookPicker notebooks={notebooks} onChange={setTargetNotebookId} selectedNotebookId={targetNotebookId || fallbackNotebookId} />
          {!targetNotebookId ? (
            <View style={styles.warningPanel}>
              <Text style={styles.warningText}>当前无法创建笔记，请先创建可用笔记本。</Text>
            </View>
          ) : null}
          {MEMO_TEMPLATES.map((template) => (
            <Pressable
              disabled={!targetNotebookId || createFromTemplateMutation.isPending}
              key={template.id}
              onPress={() => createFromTemplateMutation.mutate(template)}
              style={[styles.templateCard, (!targetNotebookId || createFromTemplateMutation.isPending) && styles.buttonDisabled]}
            >
              <View style={styles.templateIcon}>
                <FileText color="#047857" size={20} />
              </View>
              <View style={styles.templateText}>
                <Text style={styles.panelValue}>{template.title}</Text>
                <Text style={styles.panelLabel}>{template.description}</Text>
              </View>
              {createFromTemplateMutation.isPending ? <ActivityIndicator color="#0f172a" /> : null}
            </Pressable>
          ))}
          {createFromTemplateMutation.error ? (
            <Text style={styles.errorText}>{createFromTemplateMutation.error instanceof Error ? createFromTemplateMutation.error.message : "创建失败"}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const NotebookManagerModal = ({
  notebookSortMode,
  notebooks,
  onClose,
  onSortModeChange,
  visible,
}: {
  notebookSortMode: MobileNotebookSortMode;
  notebooks: Notebook[];
  onClose: () => void;
  onSortModeChange: (sortMode: MobileNotebookSortMode) => void;
  visible: boolean;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const createNotebookInputRef = useRef<TextInput>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingParentId, setEditingParentId] = useState<string | null>(null);
  const [notebookSearchText, setNotebookSearchText] = useState("");
  const [collapsedNotebookIds, setCollapsedNotebookIds] = useState<Set<string>>(() => new Set());
  const notebookOptions = flattenNotebooks(notebooks, notebookSortMode);
  const notebookSearchQuery = notebookSearchText.trim();
  const childNotebookIds = getNotebookParentIdSet(notebooks);
  const visibleNotebookOptions = notebookSearchQuery
    ? filterNotebookOptions(notebookOptions, notebookSearchText)
    : filterCollapsedNotebookOptions(notebookOptions, collapsedNotebookIds);

  const invalidateNotebooks = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
    ]);
  };

  const createNotebookMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const trimmed = name.trim();

      if (!trimmed) {
        throw new Error("请输入笔记本名称");
      }

      return client.createNotebook({ name: trimmed, parentId });
    },
    onSuccess: async () => {
      setName("");
      setParentId(null);
      await invalidateNotebooks();
    },
  });

  const renameNotebookMutation = useMutation({
    mutationFn: async ({ notebookId, nextName, nextParentId }: { notebookId: string; nextName: string; nextParentId: string | null }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const trimmed = nextName.trim();

      if (!trimmed) {
        throw new Error("请输入笔记本名称");
      }

      return client.updateNotebook(notebookId, { name: trimmed, parentId: nextParentId });
    },
    onSuccess: async () => {
      setEditingNotebookId(null);
      setEditingName("");
      setEditingParentId(null);
      await invalidateNotebooks();
    },
  });

  const deleteNotebookMutation = useMutation({
    mutationFn: async (notebookId: string) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.deleteNotebook(notebookId);
    },
    onSuccess: invalidateNotebooks,
  });

  const requestDeleteNotebook = (notebook: Notebook) => {
    Alert.alert("删除笔记本？", `将删除“${notebook.name}”。如果服务端不允许删除非空笔记本，请先移动或删除其中笔记。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => deleteNotebookMutation.mutate(notebook.id),
      },
    ]);
  };

  const prepareCreateChildNotebook = (notebook: Notebook) => {
    setParentId(notebook.id);
    setName("");
    setTimeout(() => createNotebookInputRef.current?.focus(), 50);
  };

  const toggleNotebookCollapsed = (notebookId: string) => {
    setCollapsedNotebookIds((current) => {
      const next = new Set(current);

      if (next.has(notebookId)) {
        next.delete(notebookId);
      } else {
        next.add(notebookId);
      }

      return next;
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>笔记本管理</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.label}>新建笔记本</Text>
          <View style={styles.inlineForm}>
            <TextInput ref={createNotebookInputRef} onChangeText={setName} placeholder="笔记本名称" placeholderTextColor="#94a3b8" style={[styles.titleInput, styles.inlineInput]} value={name} />
            <Pressable
              disabled={createNotebookMutation.isPending}
              onPress={() => createNotebookMutation.mutate()}
              style={[styles.inlineButton, createNotebookMutation.isPending && styles.buttonDisabled]}
            >
              <Plus color="#ffffff" size={18} />
            </Pressable>
          </View>
          <Text style={styles.label}>父级笔记本</Text>
          <NotebookParentSelector
            currentParentId={parentId}
            options={notebookOptions}
            onChange={setParentId}
          />
          {createNotebookMutation.error ? (
            <Text style={styles.errorText}>{createNotebookMutation.error instanceof Error ? createNotebookMutation.error.message : "创建失败"}</Text>
          ) : null}

          <Text style={styles.label}>全部笔记本</Text>
          <View style={styles.searchBox}>
            <Search color="#64748b" size={18} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setNotebookSearchText}
              placeholder="搜索笔记本"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              value={notebookSearchText}
            />
            {notebookSearchText ? (
              <Pressable onPress={() => setNotebookSearchText("")}>
                <X color="#64748b" size={18} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <OptionPill active={notebookSortMode === "manual"} label="手动排序" onPress={() => onSortModeChange("manual")} />
            <OptionPill active={notebookSortMode === "name-asc"} label="名称 A-Z" onPress={() => onSortModeChange("name-asc")} />
            <OptionPill active={notebookSortMode === "memo-count-desc"} label="笔记数量" onPress={() => onSortModeChange("memo-count-desc")} />
            <OptionPill active={notebookSortMode === "updated-desc"} label="最近更新" onPress={() => onSortModeChange("updated-desc")} />
          </ScrollView>
          {visibleNotebookOptions.map(({ depth, notebook }) => {
            const editing = editingNotebookId === notebook.id;
            const parentOptions = notebookOptions.filter((option) => option.notebook.id !== notebook.id && !isNotebookDescendant(notebooks, option.notebook.id, notebook.id));

            return (
              <View key={notebook.id} style={[styles.notebookManageRow, depth > 0 && { marginLeft: Math.min(depth * 14, 42) }]}>
                {childNotebookIds.has(notebook.id) && !notebookSearchQuery ? (
                  <Pressable accessibilityRole="button" onPress={() => toggleNotebookCollapsed(notebook.id)} style={styles.notebookTreeToggle}>
                    {collapsedNotebookIds.has(notebook.id) ? <ChevronRight color="#64748b" size={17} /> : <ChevronDown color="#64748b" size={17} />}
                  </Pressable>
                ) : (
                  <View style={styles.notebookTreeTogglePlaceholder} />
                )}
                {editing ? (
                  <View style={styles.notebookEditBox}>
                    <TextInput onChangeText={setEditingName} style={styles.titleInput} value={editingName} />
                    <NotebookParentSelector
                      currentParentId={editingParentId}
                      options={parentOptions}
                      onChange={setEditingParentId}
                    />
                  </View>
                ) : (
                  <View style={styles.notebookManageText}>
                    <Text numberOfLines={1} style={styles.panelValue}>
                      {depth > 0 ? `${"· ".repeat(depth)}${notebook.name}` : notebook.name}
                    </Text>
                    <Text style={styles.panelLabel}>{notebook.memoCount} 条笔记{notebook.parentId ? " · 子级笔记本" : ""}</Text>
                  </View>
                )}

                {editing ? (
                  <IconButton onPress={() => renameNotebookMutation.mutate({ notebookId: notebook.id, nextName: editingName, nextParentId: editingParentId })}>
                    {renameNotebookMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={18} />}
                  </IconButton>
                ) : (
                  <IconButton
                    onPress={() => {
                      setEditingNotebookId(notebook.id);
                      setEditingName(notebook.name);
                      setEditingParentId(notebook.parentId);
                    }}
                  >
                    <Pencil color="#0f172a" size={18} />
                  </IconButton>
                )}
                {!editing ? (
                  <IconButton disabled={createNotebookMutation.isPending} onPress={() => prepareCreateChildNotebook(notebook)}>
                    <Plus color="#0f172a" size={18} />
                  </IconButton>
                ) : null}
                <IconButton onPress={() => requestDeleteNotebook(notebook)}>
                  <Trash2 color="#b91c1c" size={18} />
                </IconButton>
              </View>
            );
          })}
          {visibleNotebookOptions.length === 0 ? (
            <View style={styles.emptyInlinePanel}>
              <BookOpen color="#94a3b8" size={28} />
              <Text style={styles.mutedText}>没有匹配的笔记本</Text>
            </View>
          ) : null}
          {renameNotebookMutation.error ? (
            <Text style={styles.errorText}>{renameNotebookMutation.error instanceof Error ? renameNotebookMutation.error.message : "重命名失败"}</Text>
          ) : null}
          {deleteNotebookMutation.error ? (
            <Text style={styles.errorText}>{deleteNotebookMutation.error instanceof Error ? deleteNotebookMutation.error.message : "删除失败"}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const TagsManagerModal = ({ onClose, visible }: { onClose: () => void; visible: boolean }) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [editingTagValue, setEditingTagValue] = useState("");

  const tagsQuery = useQuery({
    queryKey: ["mobile", "tags"],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listTags();
    },
    enabled: Boolean(client && visible),
  });

  const invalidateTagsAndMemos = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "tags"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
    ]);
  };

  const renameTagMutation = useMutation({
    mutationFn: async ({ tag, name }: { tag: string; name: string }) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const trimmed = name.trim();

      if (!trimmed) {
        throw new Error("请输入标签名称");
      }

      return client.renameTag(tag, trimmed);
    },
    onSuccess: async () => {
      setEditingTagName(null);
      setEditingTagValue("");
      await invalidateTagsAndMemos();
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.deleteTag(tag);
    },
    onSuccess: invalidateTagsAndMemos,
  });

  const requestDeleteTag = (tag: TagSummary) => {
    Alert.alert("删除标签？", `将从 ${tag.memoCount} 条笔记中移除 #${tag.name}。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => deleteTagMutation.mutate(tag.name),
      },
    ]);
  };

  const tags = tagsQuery.data?.tags ?? [];

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>标签管理</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        {tagsQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : tags.length === 0 ? (
          <View style={styles.centerState}>
            <Tag color="#94a3b8" size={32} />
            <Text style={styles.emptyTitle}>暂无标签</Text>
            <Text style={styles.mutedText}>在编辑笔记时添加标签后会显示在这里</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.editorForm}>
            <Text style={styles.sectionSubtitle}>共 {tags.length} 个标签</Text>
            {tags.map((tag) => {
              const editing = editingTagName === tag.name;
              const nextName = editingTagValue.trim();

              return (
                <View key={tag.name} style={styles.tagManageRow}>
                  {editing ? (
                    <TextInput
                      autoFocus
                      onChangeText={setEditingTagValue}
                      placeholder="标签名称"
                      placeholderTextColor="#94a3b8"
                      style={[styles.titleInput, styles.inlineInput]}
                      value={editingTagValue}
                    />
                  ) : (
                    <View style={styles.notebookManageText}>
                      <Text numberOfLines={1} style={styles.panelValue}>
                        #{tag.name}
                      </Text>
                      <Text style={styles.panelLabel}>{tag.memoCount} 条笔记 · {tag.updatedAt ? formatDate(tag.updatedAt) : "未更新"}</Text>
                    </View>
                  )}

                  {editing ? (
                    <>
                      <IconButton onPress={() => renameTagMutation.mutate({ tag: tag.name, name: nextName })}>
                        {renameTagMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={18} />}
                      </IconButton>
                      <IconButton
                        onPress={() => {
                          setEditingTagName(null);
                          setEditingTagValue("");
                        }}
                      >
                        <X color="#0f172a" size={18} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton
                        onPress={() => {
                          setEditingTagName(tag.name);
                          setEditingTagValue(tag.name);
                        }}
                      >
                        <Pencil color="#0f172a" size={18} />
                      </IconButton>
                      <IconButton onPress={() => requestDeleteTag(tag)}>
                        <Trash2 color="#b91c1c" size={18} />
                      </IconButton>
                    </>
                  )}
                </View>
              );
            })}
            {renameTagMutation.error ? (
              <Text style={styles.errorText}>{renameTagMutation.error instanceof Error ? renameTagMutation.error.message : "重命名失败"}</Text>
            ) : null}
            {deleteTagMutation.error ? (
              <Text style={styles.errorText}>{deleteTagMutation.error instanceof Error ? deleteTagMutation.error.message : "删除失败"}</Text>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const ApiTokensModal = ({ baseUrl, onClose, visible }: { baseUrl: string; onClose: () => void; visible: boolean }) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState("MCP Agent");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(() => new Set(ALL_TOKEN_SCOPES));
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const tokensQuery = useQuery({
    queryKey: ["mobile", "api-tokens"],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listApiTokens();
    },
    enabled: Boolean(client && visible),
  });

  const availableScopes = tokensQuery.data?.availableScopes ?? ALL_TOKEN_SCOPES;
  const tokens = tokensQuery.data?.apiTokens ?? [];

  useEffect(() => {
    if (tokensQuery.data?.availableScopes) {
      setSelectedScopes(new Set(tokensQuery.data.availableScopes));
    }
  }, [tokensQuery.data?.availableScopes]);

  const createTokenMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      const trimmedName = name.trim();
      const scopes = Array.from(selectedScopes);

      if (!trimmedName) {
        throw new Error("请输入 Token 名称");
      }

      if (scopes.length === 0) {
        throw new Error("请至少选择一个权限");
      }

      return client.createApiToken({ name: trimmedName, scopes });
    },
    onSuccess: async (data) => {
      setCreatedToken(data.token);
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["mobile", "api-tokens"] });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.revokeApiToken(tokenId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile", "api-tokens"] });
    },
  });

  const toggleScope = (scope: string) => {
    setSelectedScopes((current) => {
      const next = new Set(current);

      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }

      return next;
    });
  };

  const copyText = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedValue(label);
    setTimeout(() => {
      setCopiedValue((current) => (current === label ? null : current));
    }, 1600);
  };

  const requestRevokeToken = (token: ApiToken) => {
    Alert.alert("撤销 Token？", `将撤销“${token.name}”，使用它的 MCP 客户端会失去访问权限。`, [
      { text: "取消", style: "cancel" },
      {
        text: "撤销",
        style: "destructive",
        onPress: () => revokeTokenMutation.mutate(token.id),
      },
    ]);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>MCP 与 API Token</Text>
          <IconButton onPress={() => tokensQuery.refetch()}>
            {tokensQuery.isFetching ? <ActivityIndicator color="#0f172a" /> : <RefreshCw color="#0f172a" size={18} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.sectionSubtitle}>创建远程 MCP 或 API 调用使用的 Bearer Token。</Text>

          {createdToken ? (
            <View style={styles.createdTokenPanel}>
              <View style={styles.assetsSummary}>
                <ShieldCheck color="#047857" size={18} />
                <Text style={styles.assetsSummaryText}>Token 已创建</Text>
              </View>
              <Text selectable numberOfLines={2} style={styles.tokenValueText}>
                {createdToken}
              </Text>
              <View style={styles.tokenActionRow}>
                <ActionButton label={copiedValue === "created-token" ? "已复制" : "复制 Token"} onPress={() => copyText(createdToken, "created-token")}>
                  <Copy color="#0f172a" size={16} />
                </ActionButton>
                <ActionButton label={copiedValue === "created-config" ? "已复制" : "复制 MCP 配置"} onPress={() => copyText(buildMcpRemoteConfig(baseUrl, createdToken), "created-config")}>
                  <KeyRound color="#0f172a" size={16} />
                </ActionButton>
              </View>
              <Text style={styles.assetsHint}>请立即保存。离开后服务端不会再次显示完整 Token。</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Token 名称</Text>
          <TextInput onChangeText={setName} placeholder="MCP Agent" placeholderTextColor="#94a3b8" style={styles.titleInput} value={name} />

          <Text style={styles.label}>权限范围</Text>
          <View style={styles.scopeGrid}>
            {availableScopes.map((scope) => {
              const selected = selectedScopes.has(scope);

              return (
                <Pressable key={scope} onPress={() => toggleScope(scope)} style={[styles.scopePill, selected && styles.scopePillActive]}>
                  <Text style={[styles.scopePillText, selected && styles.scopePillTextActive]}>{getTokenScopeLabel(scope)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            disabled={createTokenMutation.isPending}
            onPress={() => createTokenMutation.mutate()}
            style={[styles.uploadButton, createTokenMutation.isPending && styles.buttonDisabled]}
          >
            {createTokenMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Plus color="#ffffff" size={18} />}
            <Text style={styles.uploadButtonText}>{createTokenMutation.isPending ? "创建中" : "创建 Token"}</Text>
          </Pressable>
          {createTokenMutation.error ? (
            <Text style={styles.errorText}>{createTokenMutation.error instanceof Error ? createTokenMutation.error.message : "创建失败"}</Text>
          ) : null}

          <Text style={styles.label}>活跃 Token</Text>
          {tokensQuery.isLoading ? (
            <View style={styles.centerInline}>
              <ActivityIndicator color="#0f172a" />
            </View>
          ) : tokens.length === 0 ? (
            <View style={styles.emptyInlinePanel}>
              <KeyRound color="#94a3b8" size={28} />
              <Text style={styles.mutedText}>暂无 Token</Text>
            </View>
          ) : (
            tokens.map((token) => (
              <ApiTokenRow
                baseUrl={baseUrl}
                copiedValue={copiedValue}
                isDeleting={revokeTokenMutation.isPending}
                key={token.id}
                onCopy={copyText}
                onDelete={requestRevokeToken}
                token={token}
              />
            ))
          )}
          {revokeTokenMutation.error ? (
            <Text style={styles.errorText}>{revokeTokenMutation.error instanceof Error ? revokeTokenMutation.error.message : "撤销失败"}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const ApiTokenRow = ({
  baseUrl,
  copiedValue,
  isDeleting,
  onCopy,
  onDelete,
  token,
}: {
  baseUrl: string;
  copiedValue: string | null;
  isDeleting: boolean;
  onCopy: (value: string, label: string) => void;
  onDelete: (token: ApiToken) => void;
  token: ApiToken;
}) => {
  const tokenCopyLabel = `token-${token.id}`;
  const configCopyLabel = `config-${token.id}`;

  return (
    <View style={[styles.apiTokenRow, token.isRevoked && styles.buttonDisabled]}>
      <View style={styles.notebookManageText}>
        <Text numberOfLines={1} style={styles.panelValue}>
          {token.name}
        </Text>
        <Text numberOfLines={2} style={styles.panelLabel}>
          {token.scopes.map(getTokenScopeLabel).join("、") || "无权限"}
        </Text>
        <Text style={styles.panelLabel}>{token.lastUsedAt ? `最近使用 ${formatDate(token.lastUsedAt)}` : "从未使用"}</Text>
      </View>
      <View style={styles.apiTokenActions}>
        <IconButton onPress={() => token.token && onCopy(token.token, tokenCopyLabel)}>
          {copiedValue === tokenCopyLabel ? <ShieldCheck color="#047857" size={18} /> : <Copy color={token.token ? "#0f172a" : "#cbd5e1"} size={18} />}
        </IconButton>
        <IconButton onPress={() => token.token && onCopy(buildMcpRemoteConfig(baseUrl, token.token), configCopyLabel)}>
          {copiedValue === configCopyLabel ? <ShieldCheck color="#047857" size={18} /> : <KeyRound color={token.token ? "#0f172a" : "#cbd5e1"} size={18} />}
        </IconButton>
        <IconButton onPress={() => !isDeleting && onDelete(token)}>
          <Trash2 color="#b91c1c" size={18} />
        </IconButton>
      </View>
    </View>
  );
};

const EvernoteGuideModal = ({ onClose, visible }: { onClose: () => void; visible: boolean }) => {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const copyText = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedValue(label);
    setTimeout(() => setCopiedValue((current) => (current === label ? null : current)), 1600);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>Evernote 导入指引</Text>
          <IconButton onPress={() => copyText(EVERNOTE_MIGRATION_PROMPT, "prompt-header")}>
            {copiedValue === "prompt-header" ? <ShieldCheck color="#047857" size={18} /> : <Copy color="#0f172a" size={18} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <View style={styles.guideHero}>
            <Upload color="#047857" size={24} />
            <Text style={styles.panelValue}>推荐通过 AI 编程助手 + EdgeEver MCP 自动迁移</Text>
            <Text style={styles.panelLabel}>
              该方案支持大体量 ENEX 导入、WebP 图片转换、创建/修改时间保留，以及嵌套笔记本目录层级还原。
            </Text>
          </View>

          <GuideStep
            title="1. 配置 EdgeEver MCP 服务"
            body="在设置页打开“MCP 与 API Token”，创建包含笔记本、笔记、资源、标签读写权限的 Token，复制完整 MCP 配置并交给 AI 编程助手安装。"
          />
          <GuideStep
            title="2. 发送完整迁移 Prompt"
            body="让助手安装 evernote-backup，初始化印象笔记 china 后端数据库，同步并导出 ENEX，再下载 EdgeEver 迁移脚本执行导入。"
          />
          <GuideStep
            title="3. 按需限定导入范围"
            body="默认会全量迁移。只想导入部分笔记本时，让助手在导入命令后追加 --include 参数。"
          />
          <GuideStep
            title="4. 回到 EdgeEver 验证"
            body="导入完成后刷新客户端，检查笔记本组层级、笔记正文、图片资源、创建时间和修改时间是否正常。"
          />

          <View style={styles.promptCard}>
            <View style={styles.promptCardHeader}>
              <Text style={styles.panelValue}>可直接复制给 AI 助手的 Prompt</Text>
              <ActionButton label={copiedValue === "prompt-card" ? "已复制" : "复制"} onPress={() => copyText(EVERNOTE_MIGRATION_PROMPT, "prompt-card")}>
                {copiedValue === "prompt-card" ? <ShieldCheck color="#047857" size={16} /> : <Copy color="#0f172a" size={16} />}
              </ActionButton>
            </View>
            <Text selectable style={styles.revisionPreviewText}>
              {EVERNOTE_MIGRATION_PROMPT}
            </Text>
          </View>

          <View style={styles.revisionPreviewBlock}>
            <Text style={styles.label}>手动模式备用</Text>
            <Text style={styles.revisionPreviewText}>
              不使用 AI 助手时，可以手动下载迁移脚本并按脚本头部注释执行。脚本地址：
            </Text>
            <Text selectable style={styles.tokenValueText}>
              {EVERNOTE_IMPORT_SCRIPT_URL}
            </Text>
            <View style={styles.tokenActionRow}>
              <ActionButton label={copiedValue === "script-url" ? "已复制" : "复制地址"} onPress={() => copyText(EVERNOTE_IMPORT_SCRIPT_URL, "script-url")}>
                {copiedValue === "script-url" ? <ShieldCheck color="#047857" size={16} /> : <Copy color="#0f172a" size={16} />}
              </ActionButton>
              <ActionButton label="打开" onPress={() => Linking.openURL(EVERNOTE_IMPORT_SCRIPT_URL)}>
                <ExternalLink color="#0f172a" size={16} />
              </ActionButton>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const AdvancedPlayModal = ({ onClose, visible }: { onClose: () => void; visible: boolean }) => {
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const copyPrompt = async (promptId: string, prompt: string) => {
    await Clipboard.setStringAsync(prompt);
    setCopiedPromptId(promptId);
    setTimeout(() => setCopiedPromptId((current) => (current === promptId ? null : current)), 1600);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>进阶玩法</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <View style={styles.guideHero}>
            <Sparkles color="#047857" size={24} />
            <Text style={styles.panelValue}>搭配 AI Agent 的进阶工作流</Text>
            <Text style={styles.panelLabel}>复制 Prompt 后，配合 EdgeEver MCP 让 AI 读取真实笔记并输出结构化结果。</Text>
          </View>

          {ADVANCED_PROMPTS.map((item) => (
            <View key={item.id} style={styles.promptCard}>
              <View style={styles.promptCardHeader}>
                <Text style={styles.panelValue}>{item.title}</Text>
                <ActionButton label={copiedPromptId === item.id ? "已复制" : "复制"} onPress={() => copyPrompt(item.id, item.prompt)}>
                  {copiedPromptId === item.id ? <ShieldCheck color="#047857" size={16} /> : <Copy color="#0f172a" size={16} />}
                </ActionButton>
              </View>
              <Text selectable style={styles.revisionPreviewText}>
                {item.prompt}
              </Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const SyncQueueModal = ({
  onChanged,
  onClose,
  onSync,
  visible,
}: {
  onChanged: () => void | Promise<void>;
  onClose: () => void;
  onSync: () => void | Promise<void>;
  visible: boolean;
}) => {
  const [items, setItems] = useState<MobileSyncQueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshItems = async () => {
    setLoading(true);
    try {
      setItems(await listMobileSyncQueueItems());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      void refreshItems();
    }
  }, [visible]);

  const discardItem = (item: MobileSyncQueueItem) => {
    Alert.alert("丢弃本地变更？", "此操作会移除这条待同步记录，不会修改服务端笔记。", [
      { text: "取消", style: "cancel" },
      {
        text: "丢弃",
        style: "destructive",
        onPress: async () => {
          await deleteMobileSyncQueueItem(item.id);
          await onChanged();
          await refreshItems();
        },
      },
    ]);
  };

  const syncAll = async () => {
    await onSync();
    await onChanged();
    await refreshItems();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>同步队列</Text>
          <IconButton onPress={refreshItems}>
            {loading ? <ActivityIndicator color="#0f172a" /> : <RefreshCw color="#0f172a" size={18} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <View style={styles.guideHero}>
            <RefreshCw color="#047857" size={24} />
            <Text style={styles.panelValue}>本地待同步变更</Text>
            <Text style={styles.panelLabel}>失败和冲突会保留在这里。冲突通常表示服务端版本已更新，需要确认后再处理。</Text>
          </View>

          <Pressable disabled={loading || items.length === 0} onPress={() => void syncAll()} style={[styles.uploadButton, (loading || items.length === 0) && styles.buttonDisabled]}>
            <RefreshCw color="#ffffff" size={18} />
            <Text style={styles.uploadButtonText}>立即同步全部</Text>
          </Pressable>

          {loading ? (
            <View style={styles.centerInline}>
              <ActivityIndicator color="#0f172a" />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.emptyInlinePanel}>
              <ShieldCheck color="#94a3b8" size={28} />
              <Text style={styles.mutedText}>暂无待同步变更</Text>
            </View>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.syncQueueItem}>
                <View style={styles.promptCardHeader}>
                  <Text style={styles.panelValue}>{item.payload.title || DEFAULT_MEMO_TITLE}</Text>
                  <Text style={[styles.syncStatusPill, getSyncQueueStatusStyle(item.status)]}>{getSyncQueueStatusLabel(item.status)}</Text>
                </View>
                <Text selectable style={styles.panelLabel}>
                  {item.memoId}
                </Text>
                <Text style={styles.panelHint}>
                  更新于 {formatDate(item.updatedAt)} · 尝试 {item.attemptCount} 次
                </Text>
                {item.lastError ? <Text style={styles.errorText}>{item.lastError}</Text> : null}
                <View style={styles.tokenActionRow}>
                  <ActionButton danger label="丢弃" onPress={() => discardItem(item)}>
                    <Trash2 color="#b91c1c" size={16} />
                  </ActionButton>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const GuideStep = ({ body, title }: { body: string; title: string }) => (
  <View style={styles.guideStep}>
    <Text style={styles.panelValue}>{title}</Text>
    <Text style={styles.panelLabel}>{body}</Text>
  </View>
);

const SystemInfoModal = ({
  baseUrl,
  memoCount,
  notebookCount,
  onClose,
  visible,
}: {
  baseUrl: string;
  memoCount: number;
  notebookCount: number;
  onClose: () => void;
  visible: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const expoConfig = Constants.expoConfig;
  const expoExtra = expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const nativeIdentifier = Platform.select({
    android: expoConfig?.android?.package,
    ios: expoConfig?.ios?.bundleIdentifier,
    default: expoConfig?.slug,
  });
  const infoItems = [
    { label: "版本", value: `v${MOBILE_APP_VERSION}` },
    { label: "构建", value: __DEV__ ? "development" : "production" },
    { label: "平台", value: Platform.OS },
    { label: "平台版本", value: String(Platform.Version) },
    { label: "安装形态", value: formatExecutionEnvironment(Constants.executionEnvironment) },
    { label: "应用标识", value: nativeIdentifier || "未知" },
    { label: "Expo Owner", value: expoConfig?.owner || "未设置" },
    { label: "Expo Slug", value: expoConfig?.slug || "未知" },
    { label: "EAS Project ID", value: Constants.easConfig?.projectId || expoExtra?.eas?.projectId || "未连接" },
    { label: "实例地址", value: baseUrl || "未连接" },
    { label: "笔记本数量", value: String(notebookCount) },
    { label: "笔记总数", value: String(memoCount) },
    { label: "时区", value: Intl.DateTimeFormat().resolvedOptions().timeZone || "未知" },
    { label: "语言", value: Intl.DateTimeFormat().resolvedOptions().locale || "未知" },
  ];

  const copySystemInfo = async () => {
    await Clipboard.setStringAsync(infoItems.map((item) => `${item.label}: ${item.value}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>系统信息</Text>
          <IconButton onPress={copySystemInfo}>
            {copied ? <ShieldCheck color="#047857" size={18} /> : <Copy color="#0f172a" size={18} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.sectionSubtitle}>用于排查客户端、实例连接和多端环境问题。</Text>
          {infoItems.map((item) => (
            <PanelRow key={item.label} label={item.label} value={item.value} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

type ResourceFilter = "all" | "image" | "document" | "other";

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/html",
  "text/css",
  "text/javascript",
]);

const ResourcesModal = ({
  activeMemo,
  imageCompressionEnabled,
  onClose,
  visible,
}: {
  activeMemo: MemoDetail | null;
  imageCompressionEnabled: boolean;
  onClose: () => void;
  visible: boolean;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<ResourceFilter>("all");
  const [layout, setLayout] = useState<MobileResourceLayoutPreference>("grid");
  const [previewResource, setPreviewResource] = useState<ResourceListItem | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  useEffect(() => {
    if (!visible) {
      setUploadProgress("");
      return;
    }

    let mounted = true;

    readMobileResourceLayout().then((value) => {
      if (mounted) {
        setLayout(value);
      }
    });

    return () => {
      mounted = false;
    };
  }, [visible]);

  const resourcesQuery = useQuery({
    queryKey: ["mobile", "resources"],
    queryFn: async () => {
      if (!client) {
        throw new Error("Client is not ready");
      }

      return client.listResources();
    },
    enabled: Boolean(client && visible),
  });

  const uploadResourceMutation = useMutation({
    mutationFn: async () => {
      if (!client || !activeMemo) {
        throw new Error("请先打开一条可用笔记");
      }

      if (activeMemo.isDeleted) {
        throw new Error("回收站中的笔记不能上传资源");
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: "*/*",
      });

      if (result.canceled) {
        return null;
      }

      const assets = result.assets.filter((asset) => asset.uri);

      if (assets.length === 0) {
        throw new Error("没有选择文件");
      }

      const resources = [];
      let nextMarkdown = activeMemo.contentMarkdown || activeMemo.contentText || "";

      for (const [index, asset] of assets.entries()) {
        setUploadProgress(`上传 ${index + 1}/${assets.length}：${asset.name || "文件"}`);
        const form = new FormData();
        const uploadAsset = await prepareUploadAsset(asset, imageCompressionEnabled);
        form.append("file", uploadAsset as unknown as Blob);

        const { resource } = await client.uploadMemoResource(activeMemo.id, form);
        resources.push(resource);
        nextMarkdown = appendResourceMarkdown(nextMarkdown, {
          filename: resource.filename || uploadAsset.name || asset.name || "upload",
          kind: resource.kind,
          url: resource.url,
        });
      }

      setUploadProgress("写入笔记正文");
      const { memo } = await client.updateMemo(activeMemo.id, {
        contentMarkdown: nextMarkdown,
        expectedRevision: activeMemo.revision,
      });

      return { memo, resources };
    },
    onSuccess: async (result) => {
      if (!result) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "resources"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      ]);
      queryClient.setQueryData(["mobile", "memo", "notebook", result.memo.id], { memo: result.memo });
      setFilter(result.resources.some((resource) => resource.kind === "image") ? "image" : "all");
      setUploadProgress(`已上传 ${result.resources.length} 个文件`);
    },
    onError: () => {
      setUploadProgress("");
    },
  });

  const resources = resourcesQuery.data?.resources ?? [];
  const summary = resourcesQuery.data?.summary ?? {
    totalCount: 0,
    totalBytes: 0,
    imageCount: 0,
    attachmentCount: 0,
  };
  const filteredResources = resources.filter((resource) => {
    const isDocument = isDocumentResource(resource);

    if (filter === "image" && resource.kind !== "image") {
      return false;
    }

    if (filter === "document" && (!isDocument || resource.kind === "image")) {
      return false;
    }

    if (filter === "other" && (resource.kind === "image" || isDocument)) {
      return false;
    }

    const query = searchText.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      (resource.filename || "").toLowerCase().includes(query) ||
      (resource.memoTitle || "").toLowerCase().includes(query) ||
      (resource.memoExcerpt || "").toLowerCase().includes(query)
    );
  });
  const imageResources = filteredResources.filter((resource) => resource.kind === "image");
  const previewIndex = previewResource ? imageResources.findIndex((resource) => resource.id === previewResource.id) : -1;
  const handlePreviewStep = (direction: -1 | 1) => {
    if (previewIndex < 0 || imageResources.length < 2) {
      return;
    }

    const nextIndex = (previewIndex + direction + imageResources.length) % imageResources.length;
    setPreviewResource(imageResources[nextIndex]);
  };
  const handleLayoutChange = (nextLayout: MobileResourceLayoutPreference) => {
    setLayout(nextLayout);
    void writeMobileResourceLayout(nextLayout);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>资源库</Text>
          <IconButton onPress={() => resourcesQuery.refetch()}>
            {resourcesQuery.isFetching ? <ActivityIndicator color="#0f172a" /> : <RefreshCw color="#0f172a" size={18} />}
          </IconButton>
        </View>

        <View style={styles.assetsToolbar}>
          <View style={styles.assetsSummary}>
            <Archive color="#047857" size={18} />
            <Text style={styles.assetsSummaryText}>{summary.totalCount} 个文件</Text>
            <Text style={styles.assetsSummaryMeta}>{formatBytes(summary.totalBytes)}</Text>
          </View>
          <View style={styles.assetsSummary}>
            <ImageIcon color="#64748b" size={16} />
            <Text style={styles.assetsSummaryMeta}>{summary.imageCount} 张图片</Text>
            <HardDrive color="#64748b" size={16} />
            <Text style={styles.assetsSummaryMeta}>{summary.attachmentCount} 个附件</Text>
          </View>

          <View style={styles.searchBox}>
            <Search color="#64748b" size={18} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSearchText}
              placeholder="搜索文件名或来源笔记"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              value={searchText}
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText("")}>
                <X color="#64748b" size={18} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <OptionPill active={filter === "all"} label="全部" onPress={() => setFilter("all")} />
            <OptionPill active={filter === "image"} label="图片" onPress={() => setFilter("image")} />
            <OptionPill active={filter === "document"} label="文档" onPress={() => setFilter("document")} />
            <OptionPill active={filter === "other"} label="其他" onPress={() => setFilter("other")} />
          </ScrollView>

          <View style={styles.layoutToggle}>
            <Pressable accessibilityRole="button" onPress={() => handleLayoutChange("grid")} style={[styles.layoutToggleButton, layout === "grid" && styles.layoutToggleButtonActive]}>
              <Grid color={layout === "grid" ? "#047857" : "#64748b"} size={16} />
              <Text style={[styles.layoutToggleText, layout === "grid" && styles.layoutToggleTextActive]}>网格</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => handleLayoutChange("list")} style={[styles.layoutToggleButton, layout === "list" && styles.layoutToggleButtonActive]}>
              <List color={layout === "list" ? "#047857" : "#64748b"} size={16} />
              <Text style={[styles.layoutToggleText, layout === "list" && styles.layoutToggleTextActive]}>列表</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={!activeMemo || activeMemo.isDeleted || uploadResourceMutation.isPending}
            onPress={() => uploadResourceMutation.mutate()}
            style={[styles.uploadButton, (!activeMemo || activeMemo.isDeleted || uploadResourceMutation.isPending) && styles.buttonDisabled]}
          >
            {uploadResourceMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Upload color="#ffffff" size={18} />}
            <Text style={styles.uploadButtonText}>{uploadResourceMutation.isPending ? uploadProgress || "上传中" : "上传附件"}</Text>
          </Pressable>
          {uploadProgress ? <Text style={styles.assetsHint}>{uploadProgress}</Text> : null}

          <Text style={styles.assetsHint}>
            {activeMemo
              ? `当前笔记：${activeMemo.title?.trim() || activeMemo.excerpt || DEFAULT_MEMO_TITLE}；上传后会写入正文`
              : "打开一条笔记后可作为资源上传目标"}
          </Text>
          {uploadResourceMutation.error ? (
            <Text style={styles.errorText}>{uploadResourceMutation.error instanceof Error ? uploadResourceMutation.error.message : "上传失败"}</Text>
          ) : null}
        </View>

        {resourcesQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : filteredResources.length === 0 ? (
          <View style={styles.centerState}>
            <Archive color="#94a3b8" size={32} />
            <Text style={styles.emptyTitle}>{searchText || filter !== "all" ? "没有匹配资源" : "资源库为空"}</Text>
            <Text style={styles.mutedText}>{searchText || filter !== "all" ? "调整筛选条件后再试" : "PWA 上传的图片和附件会显示在这里"}</Text>
          </View>
        ) : (
          <FlatList
            columnWrapperStyle={layout === "grid" ? styles.assetGridRow : undefined}
            contentContainerStyle={layout === "grid" ? styles.assetGrid : styles.assetList}
            data={filteredResources}
            key={layout}
            keyExtractor={(resource) => resource.id}
            numColumns={layout === "grid" ? 2 : 1}
            renderItem={({ item }) => <ResourceCard layout={layout} resource={item} onOpen={() => openResource(item)} onPreview={() => setPreviewResource(item)} />}
            refreshControl={<RefreshControl onRefresh={() => resourcesQuery.refetch()} refreshing={resourcesQuery.isFetching} tintColor="#0f172a" />}
          />
        )}

        <ImagePreviewModal
          onClose={() => setPreviewResource(null)}
          onNext={() => handlePreviewStep(1)}
          onPrevious={() => handlePreviewStep(-1)}
          resource={previewResource}
          resourceCount={imageResources.length}
          resourceIndex={previewIndex}
        />
      </SafeAreaView>
    </Modal>
  );
};

const ResourceCard = ({
  layout,
  onOpen,
  onPreview,
  resource,
}: {
  layout: MobileResourceLayoutPreference;
  onOpen: () => void;
  onPreview: () => void;
  resource: ResourceListItem;
}) => {
  const source = resource.memoDeleted ? "已删除笔记" : resource.memoTitle || resource.memoExcerpt || resource.memoId;
  const isImage = resource.kind === "image";

  return (
    <Pressable onPress={isImage ? onPreview : onOpen} style={layout === "grid" ? styles.resourceGridCard : styles.resourceCard}>
      <View style={layout === "grid" ? styles.resourceGridThumb : styles.resourceThumb}>
        {isImage ? (
          <RNImage source={{ uri: resource.url }} style={styles.resourceImage} />
        ) : (
          <View style={styles.resourceFileIcon}>{getResourceIcon(resource)}</View>
        )}
      </View>
      <View style={layout === "grid" ? styles.resourceGridInfo : styles.resourceInfo}>
        <Text numberOfLines={1} style={styles.memoTitle}>
          {resource.filename || resource.id}
        </Text>
        {layout === "grid" ? (
          <Text numberOfLines={1} style={styles.panelLabel}>
            {formatBytes(resource.byteSize)} · {resource.mimeType?.split("/")[1] || resource.kind}
          </Text>
        ) : (
          <>
            <Text numberOfLines={1} style={styles.panelLabel}>
              {formatBytes(resource.byteSize)} · {resource.mimeType?.split("/")[1] || resource.kind} · {formatDate(resource.createdAt)}
            </Text>
            <Text numberOfLines={1} style={styles.panelLabel}>
              来源：{source}
            </Text>
          </>
        )}
      </View>
      {layout === "list" ? (
        <Pressable onPress={onOpen} style={styles.secondaryIconButton}>
          <ExternalLink color="#0f172a" size={16} />
        </Pressable>
      ) : null}
    </Pressable>
  );
};

const ImagePreviewModal = ({
  onClose,
  onNext,
  onPrevious,
  resource,
  resourceCount,
  resourceIndex,
}: {
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  resource: ResourceListItem | null;
  resourceCount: number;
  resourceIndex: number;
}) => (
  <Modal animationType="fade" transparent visible={Boolean(resource)} onRequestClose={onClose}>
    <View style={styles.previewBackdrop}>
      <View style={styles.previewHeader}>
        <Text numberOfLines={1} style={styles.previewTitle}>
          {resource?.filename || "图片预览"}
        </Text>
        {resourceCount > 1 && resourceIndex >= 0 ? (
          <Text style={styles.previewCounter}>
            {resourceIndex + 1}/{resourceCount}
          </Text>
        ) : null}
        <IconButton onPress={onClose}>
          <X color="#0f172a" size={20} />
        </IconButton>
      </View>
      {resource ? <RNImage resizeMode="contain" source={{ uri: resource.url }} style={styles.previewImage} /> : null}
      {resourceCount > 1 ? (
        <View style={styles.previewNavRow}>
          <Pressable accessibilityLabel="上一张" accessibilityRole="button" onPress={onPrevious} style={styles.previewNavButton}>
            <ChevronLeft color="#ffffff" size={26} />
          </Pressable>
          <Pressable accessibilityLabel="下一张" accessibilityRole="button" onPress={onNext} style={styles.previewNavButton}>
            <ChevronRight color="#ffffff" size={26} />
          </Pressable>
        </View>
      ) : null}
      {resource ? (
        <Pressable onPress={() => openResource(resource)} style={styles.previewOpenButton}>
          <ExternalLink color="#ffffff" size={18} />
          <Text style={styles.previewOpenText}>打开原文件</Text>
        </Pressable>
      ) : null}
    </View>
  </Modal>
);

const RevisionHistoryModal = ({
  memo,
  onClose,
  onRestored,
}: {
  memo: MemoDetail | null;
  onClose: () => void;
  onRestored: (memo: MemoDetail) => void;
}) => {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);

  const revisionsQuery = useQuery({
    queryKey: ["mobile", "memo-revisions", memo?.id],
    queryFn: async () => {
      if (!client || !memo) {
        throw new Error("Memo is not selected");
      }

      return client.listMemoRevisions(memo.id);
    },
    enabled: Boolean(client && memo),
  });

  const revisions = revisionsQuery.data?.revisions ?? [];
  const selectedRevision = revisions.find((revision) => revision.id === selectedRevisionId) ?? revisions[0] ?? null;
  const diffRows = selectedRevision ? buildRevisionDiffRows(selectedRevision.contentMarkdown, memo?.contentMarkdown ?? "") : null;
  const changedLines = diffRows?.changed ?? 0;

  useEffect(() => {
    if (memo && revisions.length > 0 && !selectedRevisionId) {
      setSelectedRevisionId(revisions[0].id);
    }
  }, [memo, revisions, selectedRevisionId]);

  useEffect(() => {
    if (!memo) {
      setSelectedRevisionId(null);
    }
  }, [memo]);

  useEffect(() => {
    setSelectedRevisionId(null);
  }, [memo?.id]);

  const restoreRevisionMutation = useMutation({
    mutationFn: async (revision: MemoRevision) => {
      if (!client || !memo) {
        throw new Error("Memo is not selected");
      }

      const response = await client.restoreMemoRevision(memo.id, revision.id);
      return response.memo;
    },
    onSuccess: async (restoredMemo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "memo-revisions", restoredMemo.id] }),
      ]);
      onRestored(restoredMemo);
    },
  });

  const requestRestoreRevision = (revision: MemoRevision) => {
    Alert.alert("恢复此版本？", `将把笔记内容恢复到修订 ${revision.revision}。当前内容会作为新的修订保留。`, [
      { text: "取消", style: "cancel" },
      {
        text: "恢复",
        onPress: () => restoreRevisionMutation.mutate(revision),
      },
    ]);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(memo)}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text numberOfLines={1} style={styles.modalTitle}>
            修订历史
          </Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        {revisionsQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : revisions.length === 0 ? (
          <View style={styles.centerState}>
            <History color="#94a3b8" size={32} />
            <Text style={styles.emptyTitle}>暂无历史版本</Text>
            <Text style={styles.mutedText}>笔记保存后产生的修订会显示在这里</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.editorForm}>
            <Text style={styles.detailTitle}>{memo?.title?.trim() || DEFAULT_MEMO_TITLE}</Text>
            <Text style={styles.sectionSubtitle}>{selectedRevision ? `修订 ${selectedRevision.revision} · ${changedLines} 行差异` : "请选择一个修订"}</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {revisions.map((revision) => (
                <Pressable
                  key={revision.id}
                  onPress={() => setSelectedRevisionId(revision.id)}
                  style={[styles.revisionPill, selectedRevision?.id === revision.id && styles.revisionPillActive]}
                >
                  <Text style={[styles.revisionPillTitle, selectedRevision?.id === revision.id && styles.revisionPillTitleActive]}>修订 {revision.revision}</Text>
                  <Text style={[styles.revisionPillMeta, selectedRevision?.id === revision.id && styles.revisionPillTitleActive]}>
                    {formatDate(revision.createdAt)} · {formatRevisionActor(revision.createdBy)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {selectedRevision ? (
              <>
                <ActionButton disabled={restoreRevisionMutation.isPending || Boolean(memo?.isDeleted)} label={restoreRevisionMutation.isPending ? "恢复中" : "恢复此版本"} onPress={() => requestRestoreRevision(selectedRevision)}>
                  <RotateCcw color="#0f172a" size={16} />
                </ActionButton>
                <View style={styles.revisionPreviewBlock}>
                  <Text style={styles.label}>历史版本</Text>
                  <RevisionDiffPreview rows={diffRows?.leftRows ?? []} tone="history" />
                </View>
                <View style={styles.revisionPreviewBlock}>
                  <Text style={styles.label}>当前内容</Text>
                  <RevisionDiffPreview rows={diffRows?.rightRows ?? []} tone="current" />
                </View>
              </>
            ) : null}
            {restoreRevisionMutation.error ? (
              <Text style={styles.errorText}>{restoreRevisionMutation.error instanceof Error ? restoreRevisionMutation.error.message : "恢复失败"}</Text>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const RevisionDiffPreview = ({ rows, tone }: { rows: DiffRow[]; tone: "history" | "current" }) => {
  const hasContent = rows.some((row) => row.text);

  if (!hasContent) {
    return <Text style={styles.mutedText}>没有正文内容</Text>;
  }

  return (
    <View style={styles.revisionDiffTable}>
      {rows.map((row) => {
        const changed = row.state === "changed";

        return (
          <View
            key={row.lineNumber}
            style={[
              styles.revisionDiffRow,
              changed && tone === "history" && styles.revisionDiffRowHistory,
              changed && tone === "current" && styles.revisionDiffRowCurrent,
            ]}
          >
            <Text style={styles.revisionDiffLineNumber}>{row.lineNumber}</Text>
            <Text style={[styles.revisionDiffText, row.state === "empty" && styles.revisionDiffTextEmpty]}>{row.text || " "}</Text>
          </View>
        );
      })}
    </View>
  );
};

const MemoDetailModal = ({
  isDeleting,
  isLoading,
  isRestoring,
  isSaving,
  memo,
  onClose,
  onDelete,
  onEdit,
  onRichEdit,
  onOpenNextMemo,
  onOpenPreviousMemo,
  onOpenResources,
  onOpenRevisions,
  onRestore,
  onTogglePin,
  visible,
}: {
  isDeleting: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  isSaving: boolean;
  memo: MemoDetail | null;
  onClose: () => void;
  onDelete: (memo: MemoDetail) => void;
  onEdit: (memo: MemoDetail) => void;
  onRichEdit: (memo: MemoDetail) => void;
  onOpenNextMemo?: () => void;
  onOpenPreviousMemo?: () => void;
  onOpenResources: () => void;
  onOpenRevisions: (memo: MemoDetail) => void;
  onRestore: (memo: MemoDetail) => void;
  onTogglePin: (memo: MemoDetail) => void;
  visible: boolean;
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const detailText = memo?.contentMarkdown || memo?.contentText || "没有正文内容";
  const searchMatches = useMemo(() => getTextSearchMatches(detailText, searchQuery), [detailText, searchQuery]);
  const searchMatchLabel = searchQuery.trim() ? `${searchMatches.length > 0 ? activeMatchIndex + 1 : 0}/${searchMatches.length}` : "0/0";

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [detailText, searchQuery]);

  const moveSearchMatch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) {
      return;
    }

    setActiveMatchIndex((current) => (current + direction + searchMatches.length) % searchMatches.length);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text numberOfLines={1} style={styles.modalTitle}>
            {memo?.title?.trim() || DEFAULT_MEMO_TITLE}
          </Text>
          <View style={styles.modalHeaderActions}>
            <IconButton disabled={!onOpenPreviousMemo} onPress={() => onOpenPreviousMemo?.()}>
              <ChevronLeft color={onOpenPreviousMemo ? "#0f172a" : "#cbd5e1"} size={18} />
            </IconButton>
            <IconButton disabled={!onOpenNextMemo} onPress={() => onOpenNextMemo?.()}>
              <ChevronRight color={onOpenNextMemo ? "#0f172a" : "#cbd5e1"} size={18} />
            </IconButton>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : memo ? (
          <ScrollView contentContainerStyle={styles.detailContent}>
            <Text style={styles.detailTitle}>{memo.title?.trim() || DEFAULT_MEMO_TITLE}</Text>
            <View style={styles.memoMeta}>
              <Text style={styles.memoDate}>{formatDate(memo.updatedAt)}</Text>
              <Text style={styles.memoDate}>修订 {memo.revision}</Text>
            </View>
            <View style={styles.actionRow}>
              {memo.isDeleted ? (
                <ActionButton disabled={isRestoring} label={isRestoring ? "恢复中" : "恢复"} onPress={() => onRestore(memo)}>
                  <RotateCcw color="#0f172a" size={16} />
                </ActionButton>
              ) : (
                <>
                  <ActionButton disabled={isSaving} label={memo.isPinned ? "取消置顶" : "置顶"} onPress={() => onTogglePin(memo)}>
                    <Pin color="#0f172a" size={16} />
                  </ActionButton>
                  <ActionButton label="编辑" onPress={() => onEdit(memo)}>
                    <Pencil color="#0f172a" size={16} />
                  </ActionButton>
                  <ActionButton label="富文本" onPress={() => onRichEdit(memo)}>
                    <Bold color="#0f172a" size={16} />
                  </ActionButton>
                  <ActionButton label="查找" onPress={() => setSearchOpen((open) => !open)}>
                    <Search color="#0f172a" size={16} />
                  </ActionButton>
                  <ActionButton label="历史" onPress={() => onOpenRevisions(memo)}>
                    <History color="#0f172a" size={16} />
                  </ActionButton>
                  <ActionButton label="资源" onPress={onOpenResources}>
                    <Archive color="#0f172a" size={16} />
                  </ActionButton>
                </>
              )}
              <ActionButton danger disabled={isDeleting} label={isDeleting ? "删除中" : memo.isDeleted ? "永久删除" : "删除"} onPress={() => onDelete(memo)}>
                <Trash2 color="#b91c1c" size={16} />
              </ActionButton>
            </View>
            {searchOpen ? (
              <View style={styles.noteSearchPanel}>
                <View style={styles.searchBox}>
                  <Search color="#64748b" size={18} />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSearchQuery}
                    placeholder="搜索当前笔记"
                    placeholderTextColor="#94a3b8"
                    style={styles.searchInput}
                    value={searchQuery}
                  />
                  <Text style={[styles.noteSearchCount, searchQuery.trim() && searchMatches.length === 0 && styles.noteSearchCountEmpty]}>{searchMatchLabel}</Text>
                </View>
                <View style={styles.tokenActionRow}>
                  <ActionButton disabled={searchMatches.length === 0} label="上一条" onPress={() => moveSearchMatch(-1)}>
                    <Search color={searchMatches.length === 0 ? "#cbd5e1" : "#0f172a"} size={16} />
                  </ActionButton>
                  <ActionButton disabled={searchMatches.length === 0} label="下一条" onPress={() => moveSearchMatch(1)}>
                    <Search color={searchMatches.length === 0 ? "#cbd5e1" : "#0f172a"} size={16} />
                  </ActionButton>
                </View>
              </View>
            ) : null}
            {memo.tags.length ? (
              <View style={styles.tagList}>
                {memo.tags.map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    #{tag}
                  </Text>
                ))}
              </View>
            ) : null}
            <HighlightedDetailText activeIndex={activeMatchIndex} matches={searchMatches} text={detailText} />
          </ScrollView>
        ) : (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>笔记加载失败</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const HighlightedDetailText = ({
  activeIndex,
  matches,
  text,
}: {
  activeIndex: number;
  matches: Array<{ end: number; start: number }>;
  text: string;
}) => {
  if (matches.length === 0) {
    return <Text style={styles.detailMarkdown}>{text}</Text>;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      segments.push(text.slice(cursor, match.start));
    }

    segments.push(
      <Text key={`${match.start}-${match.end}`} style={index === activeIndex ? styles.noteSearchHighlightActive : styles.noteSearchHighlight}>
        {text.slice(match.start, match.end)}
      </Text>
    );
    cursor = match.end;
  });

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return <Text style={styles.detailMarkdown}>{segments}</Text>;
};

const RichEditorModal = ({
  baseUrl,
  memo,
  notebooks,
  onClose,
  token,
}: {
  baseUrl: string;
  memo: MemoDetail | null;
  notebooks: Notebook[];
  onClose: () => void;
  token: string;
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const editorUrl = memo && baseUrl ? buildRichEditorUrl(baseUrl, memo.id) : "";
  const injectedJavaScriptBeforeContentLoaded = buildRichEditorAuthScript(token);
  const notebookLabel = memo ? notebooks.find((notebook) => notebook.id === memo.notebookId)?.name ?? "未分类" : "笔记本";
  const saveLabel = error ? "加载失败" : loading ? "加载中" : "编辑中";

  useEffect(() => {
    if (memo) {
      setLoading(true);
      setError(false);
    }
  }, [memo]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={Boolean(memo)}>
      <SafeAreaView style={styles.richEditorSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text numberOfLines={1} style={styles.modalTitle}>
            富文本编辑器
          </Text>
          <IconButton onPress={() => editorUrl && Linking.openURL(editorUrl)}>
            <ExternalLink color="#0f172a" size={18} />
          </IconButton>
        </View>

        {editorUrl ? (
          <View style={styles.richEditorContainer}>
            <View style={styles.richEditorMeta}>
              <View style={styles.richEditorTitleBlock}>
                <Text numberOfLines={1} style={styles.richEditorTitle}>
                  {memo?.title?.trim() || DEFAULT_MEMO_TITLE}
                </Text>
                <Text numberOfLines={1} style={styles.richEditorNotebook}>
                  {notebookLabel} · 修订 {memo?.revision ?? "-"}
                </Text>
              </View>
              <Text style={[styles.richEditorStatus, error ? styles.richEditorStatusError : loading ? styles.richEditorStatusLoading : styles.richEditorStatusActive]}>{saveLabel}</Text>
            </View>
            {memo?.tags.length ? (
              <ScrollView contentContainerStyle={styles.richEditorTagsContent} horizontal showsHorizontalScrollIndicator={false} style={styles.richEditorTags}>
                {memo.tags.map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    #{tag}
                  </Text>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.richEditorFrame}>
              {loading ? (
                <View style={styles.richEditorLoading}>
                  <ActivityIndicator color="#0f172a" />
                  <Text style={styles.mutedText}>正在加载 TipTap 编辑器</Text>
                </View>
              ) : null}
              {error ? (
                <View style={styles.centerState}>
                  <Text style={styles.errorText}>富文本编辑器加载失败</Text>
                  <Text style={styles.mutedText}>请确认实例已部署最新版 Web/PWA 资源。</Text>
                </View>
              ) : (
                <WebView
                  allowsBackForwardNavigationGestures
                  injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
                  onError={() => {
                    setLoading(false);
                    setError(true);
                  }}
                  onLoadEnd={() => setLoading(false)}
                  onNavigationStateChange={(state) => {
                    if (state.url && !state.url.includes("/mobile-edit.html") && !state.url.startsWith("about:")) {
                      onClose();
                    }
                  }}
                  originWhitelist={["http://*", "https://*"]}
                  source={{ uri: editorUrl }}
                  style={styles.richEditorWebView}
                />
              )}
            </View>
          </View>
        ) : (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>缺少实例地址，无法打开富文本编辑器</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const EditMemoModal = ({
  imageCompressionEnabled,
  memo,
  notebooks,
  onClose,
  onQueued,
  onSaved,
  updateMutation,
}: {
  imageCompressionEnabled: boolean;
  memo: MemoDetail | null;
  notebooks: Notebook[];
  onClose: () => void;
  onQueued: () => void | Promise<void>;
  onSaved: (memo: MemoDetail) => void;
  updateMutation: UseMutationResult<
    MemoDetail,
    Error,
    {
      memo: MemoDetail;
      payload: {
        title?: string;
        contentMarkdown?: string;
        isPinned?: boolean;
        notebookId?: string;
        tags?: string[];
      };
    }
  >;
}) => {
  const { client } = useSession();
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [notebookId, setNotebookId] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [insertTextOpen, setInsertTextOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const replaceMatches = useMemo(() => getTextSearchMatches(contentMarkdown, replaceQuery), [contentMarkdown, replaceQuery]);

  useEffect(() => {
    let mounted = true;

    if (memo) {
      setDraftLoaded(false);
      setTitle(memo.title?.trim() || "");
      setContentMarkdown(memo.contentMarkdown || "");
      setContentSelection({ start: 0, end: 0 });
      setNotebookId(memo.notebookId);
      setTagsText(memo.tags.join(", "));
      setReplaceQuery("");
      setReplaceValue("");
      setUploadProgress("");
      readMobileMemoDraft(memo.id).then((draft) => {
        if (!mounted) {
          return;
        }

        if (draft && Date.parse(draft.updatedAt) >= Date.parse(memo.updatedAt)) {
          setTitle(draft.title);
          setContentMarkdown(draft.contentMarkdown);
          setNotebookId(draft.notebookId);
          setTagsText(draft.tagsText);
        }

        setDraftLoaded(true);
      });
    } else {
      setDraftLoaded(false);
      setUploadProgress("");
    }

    return () => {
      mounted = false;
    };
  }, [memo]);

  useEffect(() => {
    if (!memo || !draftLoaded) {
      return;
    }

    const hasDraftChanges =
      title !== (memo.title?.trim() || "") ||
      contentMarkdown !== (memo.contentMarkdown || "") ||
      notebookId !== memo.notebookId ||
      tagsText !== memo.tags.join(", ");

    if (!hasDraftChanges) {
      return;
    }

    const timeout = setTimeout(() => {
      void writeMobileMemoDraft({
        memoId: memo.id,
        expectedRevision: memo.revision,
        title,
        contentMarkdown,
        notebookId,
        tagsText,
        updatedAt: new Date().toISOString(),
      });
    }, 350);

    return () => clearTimeout(timeout);
  }, [contentMarkdown, draftLoaded, memo, notebookId, tagsText, title]);

  const uploadResourceMutation = useMutation({
    mutationFn: async () => {
      if (!client || !memo) {
        throw new Error("请先打开一条可用笔记");
      }

      if (memo.isDeleted) {
        throw new Error("回收站中的笔记不能上传资源");
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: "*/*",
      });

      if (result.canceled) {
        return null;
      }

      const assets = result.assets.filter((asset) => asset.uri);

      if (assets.length === 0) {
        throw new Error("没有选择文件");
      }

      const uploadedResources = [];

      for (const [index, asset] of assets.entries()) {
        const filename = asset.name || "文件";
        setUploadProgress(`处理 ${index + 1}/${assets.length}：${filename}`);
        const form = new FormData();
        const uploadAsset = await prepareUploadAsset(asset, imageCompressionEnabled);
        form.append("file", uploadAsset as unknown as Blob);

        setUploadProgress(`上传 ${index + 1}/${assets.length}：${uploadAsset.name || filename}`);
        const { resource } = await client.uploadMemoResource(memo.id, form);
        uploadedResources.push({
          filename: resource.filename || uploadAsset.name || asset.name || "upload",
          kind: resource.kind,
          url: resource.url,
        });
      }

      setUploadProgress("插入正文");
      return uploadedResources;
    },
    onSuccess: (resources) => {
      if (!resources || resources.length === 0) {
        setUploadProgress("");
        return;
      }

      const next = resources.reduce(
        (draft, resource) => insertResourceMarkdown(draft.value, draft.selection, resource),
        { value: contentMarkdown, selection: contentSelection }
      );
      setContentMarkdown(next.value);
      setContentSelection(next.selection);
      setUploadProgress(`已插入 ${resources.length} 个资源`);
    },
    onError: () => {
      setUploadProgress("");
    },
  });

  const handleSave = () => {
    if (!memo || updateMutation.isPending) {
      return;
    }

    updateMutation.mutate(
      {
        memo,
        payload: {
          title: title.trim() || DEFAULT_MEMO_TITLE,
          contentMarkdown,
          notebookId,
          tags: parseTags(tagsText),
        },
      },
      {
        onSuccess: async (savedMemo) => {
          await clearMobileMemoDraft(savedMemo.id);
          onSaved(savedMemo);
        },
        onError: async (error) => {
          if (!shouldQueueMobileMemoSaveError(error)) {
            return;
          }

          await queueMobileMemoUpdate({
            memoId: memo.id,
            expectedRevision: memo.revision,
            title: title.trim() || DEFAULT_MEMO_TITLE,
            contentMarkdown,
            notebookId,
            tags: parseTags(tagsText),
          });
          await clearMobileMemoDraft(memo.id);
          await onQueued();
          updateMutation.reset();
          Alert.alert("已保存到本地队列", "网络恢复后可在设置页手动同步。");
        },
      }
    );
  };

  const replaceAllMatches = () => {
    if (replaceMatches.length === 0) {
      return;
    }

    const nextMarkdown = replaceTextMatches(contentMarkdown, replaceMatches, replaceValue);
    setContentMarkdown(nextMarkdown);
    setContentSelection({ start: 0, end: 0 });
  };

  const pasteClipboardText = async () => {
    const text = await Clipboard.getStringAsync();

    if (!text.trim()) {
      return;
    }

    const next = insertPlainText(contentMarkdown, contentSelection, text);
    setContentMarkdown(next.value);
    setContentSelection(next.selection);
  };

  const insertManualText = (text: string) => {
    const next = insertPlainText(contentMarkdown, contentSelection, text);
    setContentMarkdown(next.value);
    setContentSelection(next.selection);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(memo)}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>编辑笔记</Text>
          <IconButton onPress={handleSave}>
            {updateMutation.isPending ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={20} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.label}>笔记本</Text>
          <NotebookPicker notebooks={notebooks} onChange={setNotebookId} selectedNotebookId={notebookId} />

          <Text style={styles.label}>标题</Text>
          <TextInput onChangeText={setTitle} placeholder={DEFAULT_MEMO_TITLE} placeholderTextColor="#94a3b8" style={styles.titleInput} value={title} />

          <Text style={styles.label}>标签</Text>
          <TextInput onChangeText={setTagsText} placeholder="用逗号分隔标签" placeholderTextColor="#94a3b8" style={styles.titleInput} value={tagsText} />

          <Text style={styles.label}>正文</Text>
          <MarkdownToolbar
            isUploading={uploadResourceMutation.isPending}
            onAction={(action) => {
              const next = applyMarkdownAction(contentMarkdown, contentSelection, action);
              setContentMarkdown(next.value);
              setContentSelection(next.selection);
            }}
            onInsertText={() => setInsertTextOpen(true)}
            onPasteText={() => void pasteClipboardText()}
            onUploadResource={() => uploadResourceMutation.mutate()}
          />
          {uploadProgress ? <Text style={styles.assetsHint}>{uploadProgress}</Text> : null}
          <View style={styles.noteSearchPanel}>
            <View style={styles.searchBox}>
              <Search color="#64748b" size={18} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setReplaceQuery}
                placeholder="查找正文"
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
                value={replaceQuery}
              />
              <Text style={[styles.noteSearchCount, replaceQuery.trim() && replaceMatches.length === 0 && styles.noteSearchCountEmpty]}>{replaceQuery.trim() ? replaceMatches.length : 0}</Text>
            </View>
            <View style={styles.searchBox}>
              <RefreshCw color="#64748b" size={18} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setReplaceValue}
                placeholder="替换为"
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
                value={replaceValue}
              />
            </View>
            <ActionButton disabled={replaceMatches.length === 0} label="全部替换" onPress={replaceAllMatches}>
              <RefreshCw color={replaceMatches.length === 0 ? "#cbd5e1" : "#0f172a"} size={16} />
            </ActionButton>
          </View>
          <TextInput
            multiline
            onChangeText={setContentMarkdown}
            onSelectionChange={(event) => setContentSelection(event.nativeEvent.selection)}
            placeholder="Markdown 正文"
            placeholderTextColor="#94a3b8"
            selection={contentSelection}
            style={styles.markdownInput}
            textAlignVertical="top"
            value={contentMarkdown}
          />

          {updateMutation.error ? (
            <Text style={styles.errorText}>{updateMutation.error instanceof Error ? updateMutation.error.message : "保存失败"}</Text>
          ) : null}
          {uploadResourceMutation.error ? (
            <Text style={styles.errorText}>{uploadResourceMutation.error instanceof Error ? uploadResourceMutation.error.message : "上传失败"}</Text>
          ) : null}
        </ScrollView>
        <InsertTextModal onClose={() => setInsertTextOpen(false)} onInsert={insertManualText} visible={insertTextOpen} />
      </SafeAreaView>
    </Modal>
  );
};

const MemoList = ({
  emptyDescription,
  emptyTitle,
  error,
  isError,
  isLoading,
  isRefreshing,
  listDensity,
  memos,
  onMemoLongPress,
  onMemoPress,
  onRefresh,
  selectionMode = false,
  selectedMemoIds = new Set(),
}: {
  emptyDescription: string;
  emptyTitle: string;
  error?: unknown;
  isError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  listDensity: MobileMemoListDensity;
  memos: MemoSummary[];
  onMemoLongPress?: (memo: MemoSummary) => void;
  onMemoPress: (memoId: string) => void;
  onRefresh: () => void;
  selectionMode?: boolean;
  selectedMemoIds?: Set<string>;
}) => {
  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color="#0f172a" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>加载失败</Text>
        <Text style={styles.mutedText}>{error instanceof Error ? error.message : "请稍后再试"}</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={memos.length === 0 ? styles.emptyList : styles.list}
      data={memos}
      keyExtractor={(memo) => memo.id}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={isRefreshing} tintColor="#0f172a" />}
      renderItem={({ item }) => (
        <MemoCard
          memo={item}
          listDensity={listDensity}
          onLongPress={onMemoLongPress ? () => onMemoLongPress(item) : undefined}
          onPress={() => onMemoPress(item.id)}
          selected={selectedMemoIds.has(item.id)}
          selectionMode={selectionMode}
        />
      )}
      ListEmptyComponent={
        <View style={styles.centerState}>
          <BookOpen color="#94a3b8" size={32} />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.mutedText}>{emptyDescription}</Text>
        </View>
      }
    />
  );
};

const MoveSelectionModal = ({
  isMoving,
  notebooks,
  onClose,
  onMove,
  selectedCount,
  visible,
}: {
  isMoving: boolean;
  notebooks: Notebook[];
  onClose: () => void;
  onMove: (notebookId: string) => void;
  selectedCount: number;
  visible: boolean;
}) => {
  const [targetNotebookId, setTargetNotebookId] = useState("");
  const [searchText, setSearchText] = useState("");
  const notebookOptions = flattenNotebooks(notebooks);

  useEffect(() => {
    if (visible) {
      setTargetNotebookId(notebooks[0]?.id ?? "");
      setSearchText("");
    }
  }, [notebooks, visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <IconButton onPress={onClose}>
            <X color="#0f172a" size={20} />
          </IconButton>
          <Text style={styles.modalTitle}>移动笔记</Text>
          <IconButton onPress={() => targetNotebookId && onMove(targetNotebookId)}>
            {isMoving ? <ActivityIndicator color="#0f172a" /> : <Check color="#0f172a" size={20} />}
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.editorForm}>
          <Text style={styles.sectionSubtitle}>已选择 {selectedCount} 条笔记</Text>
          <View style={styles.searchBox}>
            <Search color="#64748b" size={18} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSearchText}
              placeholder="搜索笔记本"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              value={searchText}
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText("")}>
                <X color="#64748b" size={18} />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.label}>目标笔记本</Text>
          <NotebookTreeOptionRows
            emptyIconSize={28}
            notebooks={notebooks}
            onSelect={setTargetNotebookId}
            options={notebookOptions}
            searchText={searchText}
            selectedNotebookId={targetNotebookId}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const SelectionActionBar = ({
  canMerge,
  canMove,
  isBusy,
  isTrashView,
  onClear,
  onDelete,
  onMerge,
  onMove,
  onPin,
  onToggleVisibleSelection,
  pinLabel,
  selectionToggleDisabled,
  selectionToggleLabel,
  selectedCount,
}: {
  canMerge: boolean;
  canMove: boolean;
  isBusy: boolean;
  isTrashView: boolean;
  onClear: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onMove: () => void;
  onPin: () => void;
  onToggleVisibleSelection: () => void;
  pinLabel: string;
  selectionToggleDisabled: boolean;
  selectionToggleLabel: string;
  selectedCount: number;
}) => (
  <View style={styles.selectionBar}>
    <View style={styles.selectionBarHeader}>
      <Text style={styles.selectionCount}>已选 {selectedCount} 条</Text>
      <View style={styles.selectionHeaderActions}>
        <Pressable disabled={selectionToggleDisabled} onPress={onToggleVisibleSelection}>
          <Text style={[styles.selectionClear, selectionToggleDisabled && styles.selectionClearDisabled]}>{selectionToggleLabel}</Text>
        </Pressable>
        <Pressable onPress={onClear}>
          <Text style={styles.selectionClear}>取消</Text>
        </Pressable>
      </View>
    </View>
    <View style={styles.selectionActions}>
      <SelectionAction disabled={isBusy || !canMove} icon={<Folder color={canMove ? "#0f172a" : "#cbd5e1"} size={18} />} label="移动" onPress={onMove} />
      <SelectionAction disabled={isBusy || isTrashView || selectedCount === 0} icon={<Pin color={isTrashView || selectedCount === 0 ? "#cbd5e1" : "#0f172a"} size={18} />} label={pinLabel} onPress={onPin} />
      <SelectionAction disabled={isBusy || !canMerge} icon={<Merge color={canMerge ? "#0f172a" : "#cbd5e1"} size={18} />} label="合并" onPress={onMerge} />
      <SelectionAction danger disabled={isBusy || selectedCount === 0} icon={<Trash2 color={selectedCount === 0 ? "#cbd5e1" : "#b91c1c"} size={18} />} label={isTrashView ? "永久删除" : "删除"} onPress={onDelete} />
    </View>
  </View>
);

const SelectionAction = ({
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.selectionAction, disabled && styles.buttonDisabled]}>
    {icon}
    <Text style={[styles.selectionActionText, danger && styles.selectionActionTextDanger]}>{label}</Text>
  </Pressable>
);

const NotebookParentSelector = ({
  currentParentId,
  onChange,
  options,
}: {
  currentParentId: string | null;
  onChange: (parentId: string | null) => void;
  options: NotebookOption[];
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.parentSelectList}>
    <OptionPill active={currentParentId === null} label="顶层" onPress={() => onChange(null)} />
    {options.map(({ depth, notebook }) => (
      <OptionPill
        active={currentParentId === notebook.id}
        key={notebook.id}
        label={`${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${notebook.name}`}
        onPress={() => onChange(notebook.id)}
      />
    ))}
  </ScrollView>
);

const NotebookTreeOptionRows = ({
  emptyIconSize,
  notebooks,
  onSelect,
  options,
  searchText,
  selectedNotebookId,
}: {
  emptyIconSize: number;
  notebooks: Notebook[];
  onSelect: (notebookId: string) => void;
  options: NotebookOption[];
  searchText: string;
  selectedNotebookId: string;
}) => {
  const [collapsedNotebookIds, setCollapsedNotebookIds] = useState<Set<string>>(() => new Set());
  const searchQuery = searchText.trim();
  const childNotebookIds = getNotebookParentIdSet(notebooks);
  const visibleNotebookOptions = searchQuery
    ? filterNotebookOptions(options, searchText)
    : filterCollapsedNotebookOptions(options, collapsedNotebookIds);

  const toggleNotebookCollapsed = (notebookId: string) => {
    setCollapsedNotebookIds((current) => {
      const next = new Set(current);

      if (next.has(notebookId)) {
        next.delete(notebookId);
      } else {
        next.add(notebookId);
      }

      return next;
    });
  };

  if (visibleNotebookOptions.length === 0) {
    return (
      <View style={styles.emptyInlinePanel}>
        <Folder color="#94a3b8" size={emptyIconSize} />
        <Text style={styles.mutedText}>没有匹配的笔记本</Text>
      </View>
    );
  }

  return (
    <View style={styles.notebookTreeRows}>
      {visibleNotebookOptions.map(({ depth, notebook }) => (
        <View
          key={notebook.id}
          style={[styles.moveNotebookRow, selectedNotebookId === notebook.id && styles.moveNotebookRowActive, depth > 0 && { marginLeft: Math.min(depth * 14, 42) }]}
        >
          {childNotebookIds.has(notebook.id) && !searchQuery ? (
            <Pressable accessibilityRole="button" onPress={() => toggleNotebookCollapsed(notebook.id)} style={styles.notebookTreeToggle}>
              {collapsedNotebookIds.has(notebook.id) ? <ChevronRight color="#64748b" size={17} /> : <ChevronDown color="#64748b" size={17} />}
            </Pressable>
          ) : (
            <View style={styles.notebookTreeTogglePlaceholder} />
          )}
          <Pressable onPress={() => onSelect(notebook.id)} style={styles.moveNotebookSelectArea}>
            <Text numberOfLines={1} style={styles.panelValue}>
              {depth > 0 ? `${"· ".repeat(depth)}${notebook.name}` : notebook.name}
            </Text>
            <Text style={styles.panelLabel}>{notebook.memoCount} 条笔记</Text>
          </Pressable>
          {selectedNotebookId === notebook.id ? <Check color="#0f172a" size={18} /> : null}
        </View>
      ))}
    </View>
  );
};

const NotebookPicker = ({
  notebooks,
  onChange,
  selectedNotebookId,
}: {
  notebooks: Notebook[];
  onChange: (notebookId: string) => void;
  selectedNotebookId: string;
}) => {
  const [searchText, setSearchText] = useState("");
  const notebookOptions = flattenNotebooks(notebooks);

  return (
    <View style={styles.notebookPicker}>
      <View style={styles.searchBox}>
        <Search color="#64748b" size={18} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchText}
          placeholder="搜索笔记本"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={searchText}
        />
        {searchText ? (
          <Pressable onPress={() => setSearchText("")}>
            <X color="#64748b" size={18} />
          </Pressable>
        ) : null}
      </View>
      <NotebookTreeOptionRows
        emptyIconSize={24}
        notebooks={notebooks}
        onSelect={onChange}
        options={notebookOptions}
        searchText={searchText}
        selectedNotebookId={selectedNotebookId}
      />
    </View>
  );
};

const NotebookPill = ({
  active,
  label,
  memoCount,
  onPress,
}: {
  active: boolean;
  label: string;
  memoCount: number;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={[styles.notebookPill, active && styles.notebookPillActive]}>
    <Text numberOfLines={1} style={[styles.notebookPillText, active && styles.notebookPillTextActive]}>
      {label}
    </Text>
    <Text style={[styles.notebookPillCount, active && styles.notebookPillTextActive]}>{memoCount}</Text>
  </Pressable>
);

const OptionPill = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[styles.optionPill, active && styles.optionPillActive]}>
    <Text style={[styles.optionPillText, active && styles.optionPillTextActive]}>{label}</Text>
  </Pressable>
);

const MemoCard = ({
  listDensity,
  memo,
  onLongPress,
  onPress,
  selected = false,
  selectionMode = false,
}: {
  listDensity: MobileMemoListDensity;
  memo: MemoSummary;
  onLongPress?: () => void;
  onPress: () => void;
  selected?: boolean;
  selectionMode?: boolean;
}) => (
  <Pressable onLongPress={onLongPress} onPress={onPress} style={[styles.memoCard, listDensity === "compact" && styles.memoCardCompact, selected && styles.memoCardSelected]}>
    <View style={styles.memoCardTop}>
      {selectionMode ? (
        <View style={[styles.selectionIndicator, selected && styles.selectionIndicatorActive]}>
          {selected ? <Check color="#ffffff" size={14} /> : null}
        </View>
      ) : (
        <FileText color="#64748b" size={18} />
      )}
      <Text numberOfLines={1} style={styles.memoTitle}>
        {memo.title?.trim() || DEFAULT_MEMO_TITLE}
      </Text>
      {memo.isPinned ? <Text style={styles.pinText}>置顶</Text> : null}
    </View>
    {listDensity === "preview" ? (
      <Text numberOfLines={2} style={styles.memoExcerpt}>
        {memo.excerpt || "没有正文预览"}
      </Text>
    ) : null}
    <View style={[styles.memoMeta, listDensity === "compact" && styles.memoMetaCompact]}>
      <Text style={styles.memoDate}>{formatDate(memo.updatedAt)}</Text>
      {memo.tags.slice(0, 2).map((tag) => (
        <Text key={tag} style={styles.tag}>
          #{tag}
        </Text>
      ))}
    </View>
  </Pressable>
);

const PanelRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.panelRow}>
    <Text style={styles.panelLabel}>{label}</Text>
    <Text selectable style={styles.panelValue}>
      {value}
    </Text>
  </View>
);

const SyncQueuePanel = ({
  isSyncing,
  message,
  onOpen,
  onSync,
  summary,
}: {
  isSyncing: boolean;
  message: string;
  onOpen: () => void;
  onSync: () => void;
  summary: MobileSyncQueueSummary;
}) => {
  const hasQueuedChanges = summary.total > 0;
  const value = hasQueuedChanges ? `${summary.pending} 待同步 · ${summary.syncing} 同步中 · ${summary.error} 失败 · ${summary.conflict} 冲突` : "无待同步变更";

  return (
    <View style={styles.panelRow}>
      <Text style={styles.panelLabel}>离线同步</Text>
      <Text style={styles.panelValue}>{value}</Text>
      {message ? <Text style={styles.panelHint}>{message}</Text> : null}
      <View style={styles.tokenActionRow}>
        <Pressable disabled={isSyncing || !hasQueuedChanges} onPress={onSync} style={[styles.syncButton, (isSyncing || !hasQueuedChanges) && styles.buttonDisabled]}>
          {isSyncing ? <ActivityIndicator color="#ffffff" /> : <RefreshCw color="#ffffff" size={16} />}
          <Text style={styles.syncButtonText}>{isSyncing ? "同步中" : "立即同步"}</Text>
        </Pressable>
        <Pressable disabled={!hasQueuedChanges} onPress={onOpen} style={[styles.actionButton, !hasQueuedChanges && styles.buttonDisabled]}>
          <List color="#0f172a" size={16} />
          <Text style={styles.actionButtonText}>查看队列</Text>
        </Pressable>
      </View>
    </View>
  );
};

const IconButton = ({ children, disabled = false, onPress }: { children: ReactNode; disabled?: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.iconButton, disabled && styles.buttonDisabled]}>
    {children}
  </Pressable>
);

const ActionButton = ({
  children,
  danger = false,
  disabled = false,
  label,
  onPress,
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, danger && styles.actionButtonDanger, disabled && styles.buttonDisabled]}>
    {children}
    <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger]}>{label}</Text>
  </Pressable>
);

const BottomNavItem = ({ active = false, icon, label, onPress }: { active?: boolean; icon: ReactNode; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.bottomNavItem}>
    {icon}
    <Text style={[styles.bottomNavText, active && styles.bottomNavTextActive]}>{label}</Text>
  </Pressable>
);

const MarkdownToolbar = ({
  isUploading = false,
  onAction,
  onInsertText,
  onPasteText,
  onUploadResource,
}: {
  isUploading?: boolean;
  onAction: (action: MarkdownAction) => void;
  onInsertText?: () => void;
  onPasteText?: () => void;
  onUploadResource?: () => void;
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.markdownToolbar}>
    {onPasteText ? <MarkdownToolbarButton icon={<Copy color="#334155" size={15} />} label="粘贴" onPress={onPasteText} /> : null}
    {onInsertText ? <MarkdownToolbarButton icon={<Pencil color="#334155" size={15} />} label="输入" onPress={onInsertText} /> : null}
    {onUploadResource ? (
      <MarkdownToolbarButton disabled={isUploading} icon={<ImagePlus color="#334155" size={15} />} label={isUploading ? "上传中" : "资源"} onPress={onUploadResource} />
    ) : null}
    <MarkdownToolbarButton icon={<Heading2 color="#334155" size={15} />} label="标题" onPress={() => onAction("heading")} />
    <MarkdownToolbarButton icon={<Bold color="#334155" size={15} />} label="加粗" onPress={() => onAction("bold")} />
    <MarkdownToolbarButton icon={<Italic color="#334155" size={15} />} label="斜体" onPress={() => onAction("italic")} />
    <MarkdownToolbarButton icon={<List color="#334155" size={15} />} label="列表" onPress={() => onAction("bullet")} />
    <MarkdownToolbarButton icon={<CheckSquare color="#334155" size={15} />} label="待办" onPress={() => onAction("checklist")} />
    <MarkdownToolbarButton icon={<Quote color="#334155" size={15} />} label="引用" onPress={() => onAction("quote")} />
    <MarkdownToolbarButton icon={<Minus color="#334155" size={15} />} label="分割线" onPress={() => onAction("horizontalRule")} />
    <MarkdownToolbarButton icon={<Code color="#334155" size={15} />} label="代码" onPress={() => onAction("code")} />
    <MarkdownToolbarButton icon={<Link color="#334155" size={15} />} label="链接" onPress={() => onAction("link")} />
  </ScrollView>
);

const MarkdownToolbarButton = ({
  disabled = false,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.markdownToolButton, disabled && styles.buttonDisabled]}>
    {icon}
    <Text style={styles.markdownToolText}>{label}</Text>
  </Pressable>
);

const InsertTextModal = ({
  onClose,
  onInsert,
  visible,
}: {
  onClose: () => void;
  onInsert: (text: string) => void;
  visible: boolean;
}) => {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!visible) {
      setText("");
    }
  }, [visible]);

  const handleInsert = () => {
    if (!text.trim()) {
      return;
    }

    onInsert(text);
    setText("");
    onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.actionSheetBackdrop}>
        <Pressable style={styles.insertTextSheet}>
          <View style={styles.actionSheetHandle} />
          <Text style={styles.actionSheetTitle}>输入文本</Text>
          <TextInput
            autoFocus
            multiline
            onChangeText={setText}
            placeholder="输入要插入到正文的内容"
            placeholderTextColor="#94a3b8"
            style={styles.insertTextInput}
            textAlignVertical="top"
            value={text}
          />
          <View style={styles.actionRow}>
            <ActionButton label="取消" onPress={onClose}>
              <X color="#0f172a" size={16} />
            </ActionButton>
            <ActionButton disabled={!text.trim()} label="插入" onPress={handleInsert}>
              <Check color={text.trim() ? "#0f172a" : "#cbd5e1"} size={16} />
            </ActionButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

const applyMarkdownAction = (value: string, selection: TextSelection, action: MarkdownAction) => {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  const selectedText = value.slice(start, end);

  if (action === "heading") {
    return prefixSelectedLines(value, start, end, "## ");
  }

  if (action === "bullet") {
    return prefixSelectedLines(value, start, end, "- ");
  }

  if (action === "checklist") {
    return prefixSelectedLines(value, start, end, "- [ ] ");
  }

  if (action === "quote") {
    return prefixSelectedLines(value, start, end, "> ");
  }

  if (action === "horizontalRule") {
    const separator = value.slice(0, start).endsWith("\n") ? "" : "\n";
    const trailing = value.slice(end).startsWith("\n") ? "" : "\n";
    const replacement = `${separator}---${trailing}`;
    const nextValue = replaceRange(value, start, end, replacement);
    const nextPosition = start + replacement.length;

    return {
      value: nextValue,
      selection: { start: nextPosition, end: nextPosition },
    };
  }

  if (action === "bold") {
    return wrapSelectedText(value, start, end, "**", "**", "加粗文本");
  }

  if (action === "italic") {
    return wrapSelectedText(value, start, end, "*", "*", "斜体文本");
  }

  if (action === "link") {
    return wrapSelectedText(value, start, end, "[", "](https://)", "链接文本");
  }

  if (selectedText.includes("\n")) {
    return wrapSelectedText(value, start, end, "\n```\n", "\n```\n", selectedText || "代码块");
  }

  return wrapSelectedText(value, start, end, "`", "`", "代码");
};

const wrapSelectedText = (value: string, start: number, end: number, before: string, after: string, fallbackText: string) => {
  const selectedText = value.slice(start, end) || fallbackText;
  const replacement = `${before}${selectedText}${after}`;
  const nextValue = replaceRange(value, start, end, replacement);
  const selectedStart = start + before.length;
  const selectedEnd = selectedStart + selectedText.length;

  return {
    value: nextValue,
    selection: { start: selectedStart, end: selectedEnd },
  };
};

const prefixSelectedLines = (value: string, start: number, end: number, prefix: string) => {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", end);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const block = value.slice(lineStart, lineEnd) || "";
  const replacement = block
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join("\n");
  const nextValue = replaceRange(value, lineStart, lineEnd, replacement);

  return {
    value: nextValue,
    selection: { start: lineStart, end: lineStart + replacement.length },
  };
};

const insertResourceMarkdown = (
  value: string,
  selection: TextSelection,
  resource: {
    filename: string;
    kind: "image" | "attachment";
    url: string;
  }
) => {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  const markdown = appendResourceMarkdown("", resource).trim();
  const separatorBefore = start > 0 && !value.slice(0, start).endsWith("\n") ? "\n\n" : "";
  const separatorAfter = end < value.length && !value.slice(end).startsWith("\n") ? "\n\n" : "\n";
  const replacement = `${separatorBefore}${markdown}${separatorAfter}`;
  const nextValue = replaceRange(value, start, end, replacement);
  const nextPosition = start + replacement.length;

  return {
    value: nextValue,
    selection: { start: nextPosition, end: nextPosition },
  };
};

const insertPlainText = (value: string, selection: TextSelection, text: string) => {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  const nextValue = replaceRange(value, start, end, text);
  const nextPosition = start + text.length;

  return {
    value: nextValue,
    selection: { start: nextPosition, end: nextPosition },
  };
};

const replaceRange = (value: string, start: number, end: number, replacement: string) => `${value.slice(0, start)}${replacement}${value.slice(end)}`;

const flattenNotebooks = (notebooks: Notebook[], sortMode: MobileNotebookSortMode = "manual") => {
  const byParent = new Map<string | null, Notebook[]>();
  const byId = new Set(notebooks.map((notebook) => notebook.id));
  const result: NotebookOption[] = [];

  for (const notebook of notebooks) {
    const parentId = notebook.parentId && byId.has(notebook.parentId) ? notebook.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(notebook);
    byParent.set(parentId, siblings);
  }

  for (const siblings of byParent.values()) {
    siblings.sort(getNotebookComparator(sortMode));
  }

  const walk = (parentId: string | null, depth: number) => {
    for (const notebook of byParent.get(parentId) ?? []) {
      result.push({ notebook, depth });
      walk(notebook.id, depth + 1);
    }
  };

  walk(null, 0);
  return result;
};

const getNotebookComparator = (sortMode: MobileNotebookSortMode) => {
  if (sortMode === "name-asc") {
    return compareNotebookNameAsc;
  }

  if (sortMode === "memo-count-desc") {
    return (left: Notebook, right: Notebook) => right.memoCount - left.memoCount || compareNotebookNameAsc(left, right);
  }

  if (sortMode === "updated-desc") {
    return (left: Notebook, right: Notebook) =>
      Date.parse(right.lastMemoUpdatedAt || right.updatedAt) - Date.parse(left.lastMemoUpdatedAt || left.updatedAt) || compareNotebookNameAsc(left, right);
  }

  return compareNotebooksManual;
};

const compareNotebooksManual = (left: Notebook, right: Notebook) =>
  left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);

const compareNotebookNameAsc = (left: Notebook, right: Notebook) => left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);

const filterNotebookOptions = (options: NotebookOption[], searchText: string) => {
  const query = searchText.trim().toLowerCase();

  if (!query) {
    return options;
  }

  return options.filter(({ notebook }) => notebook.name.toLowerCase().includes(query) || (notebook.slug || "").toLowerCase().includes(query));
};

const getNotebookParentIdSet = (notebooks: Notebook[]) => {
  const notebookIds = new Set(notebooks.map((notebook) => notebook.id));
  const parentIds = new Set<string>();

  for (const notebook of notebooks) {
    if (notebook.parentId && notebookIds.has(notebook.parentId)) {
      parentIds.add(notebook.parentId);
    }
  }

  return parentIds;
};

const filterCollapsedNotebookOptions = (options: NotebookOption[], collapsedNotebookIds: Set<string>) => {
  if (collapsedNotebookIds.size === 0) {
    return options;
  }

  const visibleOptions: NotebookOption[] = [];
  let hiddenDepth: number | null = null;

  for (const option of options) {
    if (hiddenDepth !== null && option.depth > hiddenDepth) {
      continue;
    }

    hiddenDepth = null;
    visibleOptions.push(option);

    if (collapsedNotebookIds.has(option.notebook.id)) {
      hiddenDepth = option.depth;
    }
  }

  return visibleOptions;
};

const isNotebookDescendant = (notebooks: Notebook[], candidateNotebookId: string, ancestorNotebookId: string) => {
  let current = notebooks.find((notebook) => notebook.id === candidateNotebookId) ?? null;

  while (current?.parentId) {
    if (current.parentId === ancestorNotebookId) {
      return true;
    }

    current = notebooks.find((notebook) => notebook.id === current?.parentId) ?? null;
  }

  return false;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${exponent === 0 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2)} ${units[exponent]}`;
};

const isDocumentResource = (resource: ResourceListItem) => DOCUMENT_MIME_TYPES.has(resource.mimeType || "") || resource.kind === "attachment";

const getResourceIcon = (resource: ResourceListItem) => {
  const mime = (resource.mimeType || "").toLowerCase();
  const extension = (resource.filename || "").split(".").pop()?.toLowerCase() || "";

  if (mime.startsWith("image/")) {
    return <ImageIcon color="#10b981" size={28} />;
  }

  if (mime.startsWith("audio/")) {
    return <Music color="#0ea5e9" size={28} />;
  }

  if (mime.startsWith("video/")) {
    return <Video color="#e11d48" size={28} />;
  }

  if (mime === "application/pdf" || extension === "pdf") {
    return <FileText color="#dc2626" size={28} />;
  }

  if (mime.includes("spreadsheet") || mime.includes("excel") || ["xls", "xlsx", "csv"].includes(extension)) {
    return <FileSpreadsheet color="#16a34a" size={28} />;
  }

  if (mime.includes("word") || mime.includes("officedocument.wordprocessingml") || ["doc", "docx"].includes(extension)) {
    return <FileText color="#2563eb" size={28} />;
  }

  if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar") || mime.includes("gzip") || ["zip", "rar", "tar", "gz"].includes(extension)) {
    return <FileArchive color="#f59e0b" size={28} />;
  }

  return <FileText color="#64748b" size={28} />;
};

const openResource = (resource: ResourceListItem) => {
  Linking.openURL(resource.url).catch(() => {
    Alert.alert("无法打开资源", "系统没有可用应用打开此链接。");
  });
};

const appendResourceMarkdown = (
  currentMarkdown: string,
  resource: {
    filename: string;
    kind: "image" | "attachment";
    url: string;
  }
) => {
  const label = resource.filename.replace(/\]/g, "\\]");
  const markdown = resource.kind === "image" ? `![${label}](${resource.url})` : `附件：[${label}](${resource.url})`;
  const trimmed = currentMarkdown.trimEnd();

  return trimmed ? `${trimmed}\n\n${markdown}\n` : `${markdown}\n`;
};

const prepareUploadAsset = async (
  asset: DocumentPicker.DocumentPickerAsset,
  imageCompressionEnabled: boolean
): Promise<{ uri: string; name: string; type: string }> => {
  const mimeType = asset.mimeType || "application/octet-stream";
  const filename = asset.name || "upload";

  if (!imageCompressionEnabled || !COMPRESSIBLE_IMAGE_TYPES.has(mimeType)) {
    return {
      uri: asset.uri,
      name: filename,
      type: mimeType,
    };
  }

  try {
    const measured = await manipulateAsync(asset.uri, [], { compress: 1, format: SaveFormat.JPEG });
    const maxEdge = Math.max(measured.width, measured.height);
    const resizeAction = maxEdge > MAX_COMPRESSED_IMAGE_EDGE ? [{ resize: getCompressedImageSize(measured.width, measured.height) }] : [];
    const compressed = await manipulateAsync(asset.uri, resizeAction, {
      compress: IMAGE_COMPRESSION_QUALITY,
      format: SaveFormat.WEBP,
    });

    return {
      uri: compressed.uri,
      name: toCompressedImageFilename(filename),
      type: "image/webp",
    };
  } catch {
    return {
      uri: asset.uri,
      name: filename,
      type: mimeType,
    };
  }
};

const getCompressedImageSize = (width: number, height: number) => {
  if (width >= height) {
    return { width: MAX_COMPRESSED_IMAGE_EDGE };
  }

  return { height: MAX_COMPRESSED_IMAGE_EDGE };
};

const toCompressedImageFilename = (filename: string) => {
  const trimmed = filename.trim();

  if (!trimmed) {
    return "image.webp";
  }

  return trimmed.replace(/\.[^.]+$/, "") + ".webp";
};

const getTokenScopeLabel = (scope: string) => {
  const labels: Record<string, string> = {
    "read:notebooks": "读取笔记本",
    "write:notebooks": "写入笔记本",
    "read:memos": "读取笔记",
    "write:memos": "写入笔记",
    "read:resources": "读取资源",
    "write:resources": "写入资源",
    "read:tags": "读取标签",
    "write:tags": "写入标签",
  };

  return labels[scope] ?? scope;
};

const getMobileLocalePreferenceLabel = (locale: MobileLocaleMode) =>
  MOBILE_LOCALE_OPTIONS.find((option) => option.value === locale)?.label ?? "跟随系统";

const getTextSearchMatches = (text: string, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const normalizedText = text.toLowerCase();
  const matches: Array<{ end: number; start: number }> = [];
  let cursor = 0;

  while (cursor < normalizedText.length) {
    const start = normalizedText.indexOf(normalizedQuery, cursor);

    if (start === -1) {
      break;
    }

    const end = start + normalizedQuery.length;
    matches.push({ end, start });
    cursor = end;
  }

  return matches;
};

const replaceTextMatches = (text: string, matches: Array<{ end: number; start: number }>, replacement: string) => {
  let nextText = text;

  for (const match of [...matches].reverse()) {
    nextText = `${nextText.slice(0, match.start)}${replacement}${nextText.slice(match.end)}`;
  }

  return nextText;
};

const buildMcpRemoteConfig = (baseUrl: string, token: string) =>
  JSON.stringify(
    {
      mcpServers: {
        edgeever: {
          url: `${baseUrl.replace(/\/+$/, "")}/mcp`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2
  );

type DiffRow = {
  lineNumber: number;
  text: string;
  state: "same" | "changed" | "empty";
};

const buildRevisionDiffRows = (left: string, right: string) => {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const maxLines = Math.max(leftLines.length, rightLines.length, 1);
  const leftRows: DiffRow[] = [];
  const rightRows: DiffRow[] = [];
  let changed = 0;

  for (let index = 0; index < maxLines; index += 1) {
    const leftText = leftLines[index] ?? "";
    const rightText = rightLines[index] ?? "";
    const isChanged = leftText !== rightText;

    if (isChanged) {
      changed += 1;
    }

    leftRows.push({
      lineNumber: index + 1,
      text: leftText,
      state: isChanged ? "changed" : leftText ? "same" : "empty",
    });
    rightRows.push({
      lineNumber: index + 1,
      text: rightText,
      state: isChanged ? "changed" : rightText ? "same" : "empty",
    });
  }

  return { changed, leftRows, rightRows };
};

const formatRevisionActor = (actor: string) => {
  if (actor.startsWith("user:")) {
    return "user";
  }

  if (actor.startsWith("agent:")) {
    return "agent";
  }

  return actor || "system";
};

const buildRichEditorUrl = (baseUrl: string, memoId: string) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    memoId,
    returnTo: "/",
  });

  return `${normalizedBaseUrl}/mobile-edit.html#${params.toString()}`;
};

const buildRichEditorAuthScript = (token: string) => `
(() => {
  const token = ${JSON.stringify(token)};
  if (!token) {
    return true;
  }

  const applyAuthHeader = (headers) => {
    const nextHeaders = new Headers(headers || {});
    if (!nextHeaders.has("Authorization")) {
      nextHeaders.set("Authorization", "Bearer " + token);
    }
    return nextHeaders;
  };

  const shouldAuthorize = (input) => {
    const url = typeof input === "string" ? input : input && "url" in input ? input.url : "";
    if (!url) {
      return true;
    }
    return url.startsWith("/api/") || url.includes("/api/");
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    if (!shouldAuthorize(input)) {
      return originalFetch(input, init);
    }

    if (input instanceof Request) {
      const headers = applyAuthHeader(init.headers || input.headers);
      return originalFetch(new Request(input, { ...init, headers }));
    }

    return originalFetch(input, { ...init, headers: applyAuthHeader(init.headers) });
  };

  true;
})();
`;

const getSyncQueueStatusLabel = (status: MobileSyncQueueItem["status"]) => {
  const labels: Record<MobileSyncQueueItem["status"], string> = {
    pending: "待同步",
    syncing: "同步中",
    conflict: "冲突",
    error: "失败",
  };

  return labels[status];
};

const getSyncQueueStatusStyle = (status: MobileSyncQueueItem["status"]) => {
  if (status === "conflict" || status === "error") {
    return styles.syncStatusDanger;
  }

  if (status === "syncing") {
    return styles.syncStatusActive;
  }

  return styles.syncStatusPending;
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  viewBody: {
    flex: 1,
    paddingBottom: 64,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "800",
  },
  instance: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
    maxWidth: 230,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  iconButtonPlaceholder: {
    height: 38,
    width: 38,
  },
  modalHeaderActions: {
    flexDirection: "row",
    gap: 6,
  },
  tabs: {
    paddingLeft: 18,
    paddingTop: 18,
  },
  notebookPill: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginRight: 8,
    maxWidth: 190,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  notebookPillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  notebookPillText: {
    color: "#334155",
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  notebookPillTextActive: {
    color: "#ffffff",
  },
  notebookPillCount: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  contentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 10,
  },
  contentActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  searchHeader: {
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 10,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: "#0f172a",
    flex: 1,
    fontSize: 15,
    minHeight: 44,
  },
  assetsToolbar: {
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    gap: 10,
    padding: 14,
  },
  assetsSummary: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  assetsSummaryText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  assetsSummaryMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  assetsHint: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  layoutToggle: {
    alignSelf: "flex-start",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  layoutToggleButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  layoutToggleButtonActive: {
    backgroundColor: "#ecfdf5",
  },
  layoutToggleText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  layoutToggleTextActive: {
    color: "#047857",
  },
  uploadButton: {
    alignItems: "center",
    backgroundColor: "#047857",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  uploadButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  primaryIconButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  secondaryIconButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  dangerIconButton: {
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  listControls: {
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 18,
  },
  optionPill: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    marginRight: 8,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  optionPillActive: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
  },
  optionPillText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  optionPillTextActive: {
    color: "#0f172a",
  },
  list: {
    paddingBottom: 22,
    paddingHorizontal: 18,
  },
  assetList: {
    padding: 18,
    paddingBottom: 48,
  },
  assetGrid: {
    padding: 12,
    paddingBottom: 48,
  },
  assetGridRow: {
    gap: 10,
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: 22,
  },
  memoCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  memoCardCompact: {
    marginBottom: 8,
    padding: 11,
  },
  memoCardSelected: {
    backgroundColor: "#f8fafc",
    borderColor: "#0f172a",
  },
  memoCardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  selectionIndicator: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 6,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  selectionIndicatorActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  memoTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  pinText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
  },
  memoExcerpt: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  memoMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  memoMetaCompact: {
    marginTop: 8,
  },
  memoDate: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  tagList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  resourceCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 10,
  },
  resourceGridCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    marginBottom: 10,
    minWidth: 0,
    overflow: "hidden",
  },
  resourceThumb: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
    width: 58,
  },
  resourceGridThumb: {
    alignItems: "center",
    aspectRatio: 1.18,
    backgroundColor: "#f8fafc",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  resourceImage: {
    height: "100%",
    width: "100%",
  },
  resourceFileIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  resourceInfo: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  resourceGridInfo: {
    gap: 5,
    minWidth: 0,
    padding: 10,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  emptyTitle: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "800",
  },
  mutedText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
  },
  panelList: {
    gap: 12,
    padding: 18,
    paddingBottom: 96,
  },
  panelRow: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  panelLinkRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  panelLinkText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  panelLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  panelValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  panelHint: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  preferenceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  preferenceStack: {
    gap: 12,
  },
  preferenceText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  syncButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  syncButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  dangerButtonText: {
    color: "#b91c1c",
    fontSize: 15,
    fontWeight: "800",
  },
  warningPanel: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  warningText: {
    color: "#92400e",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalSafeArea: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  richEditorSafeArea: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
  richEditorContainer: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
  richEditorMeta: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  richEditorTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  richEditorTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
  },
  richEditorNotebook: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  richEditorStatus: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  richEditorStatusActive: {
    backgroundColor: "#ecfdf5",
    color: "#047857",
  },
  richEditorStatusLoading: {
    backgroundColor: "#eff6ff",
    color: "#2563eb",
  },
  richEditorStatusError: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
  },
  richEditorTags: {
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexGrow: 0,
    maxHeight: 44,
  },
  richEditorTagsContent: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  richEditorFrame: {
    flex: 1,
  },
  richEditorLoading: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    bottom: 0,
    gap: 10,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  richEditorWebView: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  modalTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    marginHorizontal: 12,
    textAlign: "center",
  },
  actionSheetBackdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.34)",
    flex: 1,
    justifyContent: "flex-end",
  },
  actionSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 8,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  actionSheetHandle: {
    alignSelf: "center",
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    height: 4,
    marginBottom: 8,
    width: 42,
  },
  actionSheetTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
    paddingBottom: 4,
  },
  actionSheetSectionTitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    paddingTop: 4,
  },
  actionSheetItem: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  actionSheetItemText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  actionSheetItemTextDanger: {
    color: "#b91c1c",
  },
  insertTextSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 10,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  insertTextInput: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 22,
    minHeight: 160,
    padding: 12,
  },
  detailContent: {
    padding: 18,
    paddingBottom: 48,
  },
  detailTitle: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
  },
  detailMarkdown: {
    color: "#1f2937",
    fontSize: 16,
    lineHeight: 25,
    marginTop: 20,
  },
  noteSearchPanel: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 10,
  },
  noteSearchCount: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  noteSearchCountEmpty: {
    color: "#b91c1c",
  },
  noteSearchHighlight: {
    backgroundColor: "#fef3c7",
    color: "#78350f",
  },
  noteSearchHighlightActive: {
    backgroundColor: "#fde68a",
    color: "#0f172a",
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  actionButtonDanger: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  actionButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  actionButtonTextDanger: {
    color: "#b91c1c",
  },
  inlineForm: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  inlineButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  notebookManageRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 58,
    padding: 10,
  },
  notebookManageText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  notebookEditBox: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  parentSelectList: {
    flexGrow: 0,
  },
  notebookPicker: {
    gap: 10,
  },
  tagManageRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 60,
    padding: 10,
  },
  createdTokenPanel: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  tokenValueText: {
    backgroundColor: "#ffffff",
    borderColor: "#a7f3d0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    padding: 10,
  },
  tokenActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scopeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scopePill: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scopePillActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#34d399",
  },
  scopePillText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  scopePillTextActive: {
    color: "#047857",
  },
  apiTokenRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 82,
    padding: 12,
  },
  apiTokenActions: {
    flexDirection: "row",
    gap: 6,
  },
  centerInline: {
    alignItems: "center",
    padding: 18,
  },
  emptyInlinePanel: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 8,
    padding: 22,
  },
  guideHero: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  guideStep: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  promptCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  promptCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  syncQueueItem: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  syncStatusPill: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  syncStatusPending: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
  },
  syncStatusActive: {
    backgroundColor: "#eff6ff",
    color: "#2563eb",
  },
  syncStatusDanger: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
  },
  templateCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 82,
    padding: 12,
  },
  templateIcon: {
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  templateText: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  moveNotebookRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    padding: 12,
  },
  moveNotebookRowActive: {
    borderColor: "#0f172a",
  },
  moveNotebookText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  moveNotebookSelectArea: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 34,
    minWidth: 0,
  },
  notebookTreeToggle: {
    alignItems: "center",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  notebookTreeTogglePlaceholder: {
    width: 32,
  },
  notebookTreeRows: {
    gap: 10,
  },
  editorForm: {
    gap: 12,
    padding: 18,
    paddingBottom: 48,
  },
  revisionPill: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    minHeight: 58,
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  revisionPillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  revisionPillTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  revisionPillTitleActive: {
    color: "#ffffff",
  },
  revisionPillMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  revisionPreviewBlock: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  revisionPreviewText: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 20,
  },
  revisionDiffTable: {
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  revisionDiffRow: {
    borderBottomColor: "#f1f5f9",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 28,
  },
  revisionDiffRowHistory: {
    backgroundColor: "#fffbeb",
  },
  revisionDiffRowCurrent: {
    backgroundColor: "#ecfdf5",
  },
  revisionDiffLineNumber: {
    borderRightColor: "#e2e8f0",
    borderRightWidth: 1,
    color: "#94a3b8",
    fontSize: 11,
    minWidth: 42,
    paddingHorizontal: 8,
    paddingTop: 6,
    textAlign: "right",
  },
  revisionDiffText: {
    color: "#334155",
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  revisionDiffTextEmpty: {
    color: "#94a3b8",
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  titleInput: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  markdownInput: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 23,
    minHeight: 260,
    padding: 14,
  },
  markdownToolbar: {
    flexGrow: 0,
  },
  markdownToolButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    marginRight: 8,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  markdownToolText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
  },
  bottomNav: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    height: 64,
    justifyContent: "space-around",
    left: 0,
    position: "absolute",
    right: 0,
  },
  selectionBar: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderTopWidth: 1,
    bottom: 64,
    left: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    position: "absolute",
    right: 0,
  },
  selectionBarHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  selectionCount: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  selectionHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  selectionClear: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
  },
  selectionClearDisabled: {
    color: "#cbd5e1",
  },
  selectionActions: {
    flexDirection: "row",
    gap: 8,
  },
  selectionAction: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 54,
  },
  selectionActionText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
  },
  selectionActionTextDanger: {
    color: "#b91c1c",
  },
  bottomNavItem: {
    alignItems: "center",
    gap: 4,
    minWidth: 58,
  },
  bottomNavText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  bottomNavTextActive: {
    color: "#0f172a",
  },
  previewBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  previewHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    flexDirection: "row",
    gap: 12,
    left: 16,
    padding: 10,
    position: "absolute",
    right: 16,
    top: 54,
    zIndex: 2,
  },
  previewTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  previewCounter: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  previewImage: {
    height: "72%",
    width: "100%",
  },
  previewNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    left: 16,
    position: "absolute",
    right: 16,
  },
  previewNavButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.68)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  previewOpenButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 42,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 16,
    position: "absolute",
  },
  previewOpenText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
