import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, Copy, HelpCircle, Image, KeyRound, LogOut, Plus, ShieldCheck, Sparkles, Trash2, UploadCloud, User } from "lucide-react";
import type { ApiToken, AuthUser } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { EVERNOTE_MIGRATION_PATH } from "@/lib/routes";
import { cn, formatDateTime } from "@/lib/utils";
import { AppConfirmDialog } from "./dialogs/ConfirmDialogs";

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

const TOKEN_SCOPE_LABELS: Record<string, string> = {
  "read:notebooks": "读取笔记本",
  "write:notebooks": "创建与修改笔记本",
  "read:memos": "读取笔记",
  "write:memos": "创建与修改笔记",
  "read:resources": "读取附件资源",
  "write:resources": "上传与修改附件",
  "read:tags": "读取标签",
  "write:tags": "创建与修改标签",
};

const getTokenScopeLabel = (scope: string) => TOKEN_SCOPE_LABELS[scope] ?? scope;

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the textarea path below.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
};

interface SettingsPaneProps {
  user: AuthUser | null;
  onClose: () => void;
  imageCompressionEnabled: boolean;
  onImageCompressionChange: (enabled: boolean) => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  authRequired: boolean;
  onShowGuide?: () => void;
}

interface ProfileCardProps {
  user: AuthUser | null;
}

const ProfileCard = ({ user }: ProfileCardProps) => (
  <Card className="w-full min-w-0 self-start overflow-hidden border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40 shadow-none">
    <CardContent className="flex items-center gap-3 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-base font-bold uppercase text-white shadow-sm shadow-emerald-200">
        {user?.username?.charAt(0) ?? "U"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-slate-900">{user?.username ?? "本地用户"}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          在线工作区已连接
        </div>
      </div>
    </CardContent>
  </Card>
);

interface PreferenceCardProps {
  imageCompressionEnabled: boolean;
  onImageCompressionChange: (enabled: boolean) => void;
}

const PreferenceCard = ({ imageCompressionEnabled, onImageCompressionChange }: PreferenceCardProps) => (
  <Card className="w-full min-w-0 overflow-hidden shadow-none">
    <CardHeader className="p-4">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Image className="h-4 w-4 text-emerald-700" />
        偏好设置
      </CardTitle>
    </CardHeader>
    <CardContent className="p-4 pt-0">
      <div className="flex min-h-14 flex-col items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">压缩笔记内图片</div>
          <div className="mt-0.5 text-xs leading-4 text-slate-500">上传大图时在本地压缩，节省资源占用。</div>
        </div>
        <div className="flex w-full shrink-0 justify-start sm:w-32">
          <Switch
            checked={imageCompressionEnabled}
            onCheckedChange={onImageCompressionChange}
            aria-label="是否压缩笔记内图片"
          />
        </div>
      </div>
    </CardContent>
  </Card>
);

const ADVANCED_PROMPTS = [
  {
    title: "人物画像",
    prompt:
      "请通过 EdgeEver MCP 读取我的笔记，基于真实笔记内容为我整理一份人物画像。请只根据笔记中的证据判断，不要做心理诊断，不要夸张定性。输出包括：长期关注的主题、做事偏好、能力线索、反复出现的问题、近期动向，并在每条结论后列出相关笔记标题或 memo id。",
  },
  {
    title: "近期复盘",
    prompt:
      "请通过 EdgeEver MCP 读取我最近更新的笔记，帮我做一次近期复盘。请总结我最近在推进什么、卡在哪里、有哪些反复出现的想法、哪些事情值得继续跟进，最后给出一份简短的下一步行动清单。",
  },
  {
    title: "项目整理",
    prompt:
      "请通过 EdgeEver MCP 读取我的笔记，找出其中和项目、产品、代码、计划相关的内容。请按项目归类，整理每个项目的目标、当前进展、待办事项、风险和相关笔记来源。不要改动我的笔记，只输出整理结果。",
  },
  {
    title: "知识地图",
    prompt:
      "请通过 EdgeEver MCP 读取我的笔记，为我整理一份知识地图。请找出主要知识领域、每个领域下的关键概念、相关笔记、我已经掌握的部分和还需要补齐的问题。输出结构要适合后续继续学习和写作。",
  },
  {
    title: "标签建议",
    prompt:
      "请通过 EdgeEver MCP 读取我的笔记和现有标签，帮我设计一套更清晰的标签体系。请指出重复、过细、过宽或命名不一致的标签，并给出合并、重命名和新增标签建议。先不要修改笔记，等我确认后再执行。",
  },
] as const;

const AdvancedPlayCard = () => {
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleCopyPrompt = async (title: string, prompt: string) => {
    if (!(await copyTextToClipboard(prompt))) {
      return;
    }

    setCopiedPrompt(title);
    window.setTimeout(() => {
      setCopiedPrompt((current) => (current === title ? null : current));
    }, 1600);
  };

  return (
    <Card className="w-full min-w-0 overflow-hidden shadow-none">
      <CardHeader className="p-4">
        <button
          className="flex w-full min-w-0 items-start justify-between gap-3 text-left"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-emerald-700" />
              进阶玩法
            </CardTitle>
            <CardDescription className="mt-1 text-xs leading-4">
              搭配AI Agent的进阶玩法。
            </CardDescription>
          </span>
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform",
              expanded ? "rotate-180" : "rotate-0"
            )}
          />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="grid gap-3 p-4 pt-0">
          {ADVANCED_PROMPTS.map((item) => (
            <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-bold text-slate-900">{item.title}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-full justify-center bg-white px-3 text-xs sm:w-auto"
                  type="button"
                  onClick={() => void handleCopyPrompt(item.title, item.prompt)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedPrompt === item.title ? "已复制" : "复制 Prompt"}
                </Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.prompt}</p>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
};

interface EvernoteImportGuideCardProps {
  onShowGuide?: () => void;
}

const EvernoteImportGuideCard = ({ onShowGuide }: EvernoteImportGuideCardProps) => (
  <Card className="hidden w-full min-w-0 overflow-hidden shadow-none lg:block">
    <CardHeader className="p-4">
      <CardTitle className="flex items-center gap-2 text-sm">
        <UploadCloud className="h-4 w-4 text-emerald-700" />
        导入印象笔记
        {onShowGuide ? (
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 bg-white px-2.5 text-xs gap-1" 
            type="button" 
            onClick={onShowGuide}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            操作指引
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 bg-white px-2.5 text-xs" type="button" asChild>
            <a
              href={EVERNOTE_MIGRATION_PATH}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="在新标签页打开印象笔记迁移操作指引"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              操作指引
            </a>
          </Button>
        )}
      </CardTitle>
      <CardDescription className="text-xs leading-4">
        查看从印象笔记迁移到 EdgeEver 的步骤，推荐使用 MCP 与 AI Agent 批量导入。
      </CardDescription>
    </CardHeader>
  </Card>
);

interface CreatedTokenNoticeProps {
  token: string;
}

const CreatedTokenNotice = ({ token }: CreatedTokenNoticeProps) => {
  const [copiedAction, setCopiedAction] = useState<"token" | "config" | null>(null);

  const handleCopy = async (action: "token" | "config") => {
    const value = action === "token" ? token : buildMcpRemoteConfig(token);
    if (!(await copyTextToClipboard(value))) {
      return;
    }

    setCopiedAction(action);
    window.setTimeout(() => {
      setCopiedAction((current) => (current === action ? null : current));
    }, 1600);
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <ShieldCheck className="h-4 w-4 text-emerald-700" />
        API Token 已成功生成
      </div>
      <div className="flex flex-col gap-2 xl:flex-row">
        <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-emerald-200 bg-white px-3 font-mono text-xs text-slate-900">
          <span className="min-w-0 truncate">{token}</span>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            size="sm"
            variant="solid"
            className="w-full whitespace-nowrap bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
            type="button"
            onClick={() => void handleCopy("token")}
          >
            {copiedAction === "token" ? "已复制" : "复制 Token"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full whitespace-nowrap border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 sm:w-auto"
            type="button"
            onClick={() => void handleCopy("config")}
          >
            {copiedAction === "config" ? "已复制" : "复制完整 MCP 配置"}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium leading-4 text-emerald-800">安全提醒：此 Token 属于高危凭证，请勿对外泄露。</p>
    </div>
  );
};

const getMcpRemoteServerUrl = () => {
  if (typeof window === "undefined") {
    return "/mcp";
  }

  return `${window.location.origin}/mcp`;
};

const getEdgeEverBaseUrl = () => {
  if (typeof window === "undefined") {
    return "https://your-domain.example";
  }

  return window.location.origin;
};

const buildMcpRemoteConfig = (token: string) =>
  JSON.stringify(
    {
      mcpServers: {
        edgeever: {
          url: getMcpRemoteServerUrl(),
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2
  );

const McpTitleWithHelp = () => {
  const baseUrl = getEdgeEverBaseUrl();
  const [copied, setCopied] = useState(false);
  const remoteExample = JSON.stringify(
    {
      mcpServers: {
        edgeever: {
          url: `${baseUrl}/mcp`,
          headers: {
            Authorization: "Bearer 我创建的token",
          },
        },
      },
    },
    null,
    2
  );

  const handleCopy = async () => {
    if (!(await copyTextToClipboard(remoteExample))) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="w-fit max-w-full">
      <CardTitle className="flex items-center gap-2 text-sm">
        <KeyRound className="h-4 w-4 text-emerald-700" />
        API & MCP 授权
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 bg-white px-2.5 text-xs" type="button">
              使用示例
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl gap-3 p-4 sm:p-5">
            <DialogHeader>
              <DialogTitle className="text-base">Remote MCP 示例</DialogTitle>
            </DialogHeader>
            <pre className="max-h-[55vh] overflow-auto rounded-md border border-slate-100 bg-slate-950 p-3 text-left text-[11px] leading-5 text-slate-100 sm:text-xs">
              <code>{remoteExample}</code>
            </pre>
            <div className="flex justify-end">
              <Button
                size="md"
                variant="solid"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                type="button"
                onClick={() => void handleCopy()}
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "已复制" : "复制示例"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardTitle>
    </div>
  );
};

interface ScopePickerProps {
  availableScopes: string[];
  selectedScopes: Set<string>;
  onToggleScope: (scope: string) => void;
}

const ScopePicker = ({ availableScopes, selectedScopes, onToggleScope }: ScopePickerProps) => (
  <ScopePickerContent
    availableScopes={availableScopes}
    selectedScopes={selectedScopes}
    onToggleScope={onToggleScope}
  />
);

const ScopePickerContent = ({ availableScopes, selectedScopes, onToggleScope }: ScopePickerProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-slate-700">Token 权限范围</span>
          <span className="mt-0.5 block text-[11px] font-medium text-slate-400">
            已选择 {selectedScopes.size}/{availableScopes.length}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            expanded ? "rotate-180" : "rotate-0"
          )}
        />
      </button>
      {expanded && (
        <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
          {availableScopes.map((scope) => {
            const checked = selectedScopes.has(scope);
            const checkboxId = `token-scope-${scope.replace(/[^a-z0-9]+/gi, "-")}`;

            return (
              <label
                key={scope}
                htmlFor={checkboxId}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                  checked
                    ? "border-emerald-500/30 bg-emerald-50/70 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  onCheckedChange={() => onToggleScope(scope)}
                  className="border-emerald-300"
                />
                <span className="min-w-0 truncate text-xs font-semibold" title={scope}>
                  {getTokenScopeLabel(scope)}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface TokenListProps {
  tokens: ApiToken[];
  isLoading: boolean;
  isDeleting: boolean;
  onDelete: (token: ApiToken) => void;
}

const TokenList = ({ tokens, isLoading, isDeleting, onDelete }: TokenListProps) => {
  const [copiedAction, setCopiedAction] = useState<{ tokenId: string; action: "token" | "config" } | null>(null);

  const handleCopy = async (token: ApiToken, action: "token" | "config") => {
    if (!token.token) {
      return;
    }

    const value = action === "token" ? token.token : buildMcpRemoteConfig(token.token);
    if (!(await copyTextToClipboard(value))) {
      return;
    }

    setCopiedAction({ tokenId: token.id, action });
    window.setTimeout(() => {
      setCopiedAction((current) => (current?.tokenId === token.id && current.action === action ? null : current));
    }, 1600);
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
        正在加载 Token 列表...
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
        暂无活跃的 API Token
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tokens.map((token) => (
        <div
          key={token.id}
          className={cn(
            "flex min-h-16 flex-col items-stretch gap-3 rounded-lg border p-3 transition-colors sm:p-4 lg:flex-row lg:items-center",
            token.isRevoked ? "border-slate-100 bg-slate-50/50 opacity-60" : "border-slate-200 bg-white hover:border-slate-300"
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold leading-tight text-slate-900">{token.name}</span>
            <span
              className="mt-2 block w-fit max-w-full truncate rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500"
              title={token.scopes.join(", ")}
            >
              {token.scopes.map(getTokenScopeLabel).join("、") || "无权限"}
            </span>
            <span className="mt-2 block text-[11px] font-medium text-slate-400">
              {token.lastUsedAt ? `上次调用时间：${formatDateTime(token.lastUsedAt)}` : "从未被调用"}
              {!token.token ? " · 旧 Token 无法找回明文，请重新生成" : ""}
            </span>
          </span>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:items-center">
            <Button
              size="sm"
              variant="outline"
              className="h-9 justify-center whitespace-nowrap bg-white px-3 text-xs"
              title={token.token ? "复制 Token" : "旧 Token 无法复制"}
              aria-label={token.token ? "复制 Token" : "旧 Token 无法复制"}
              disabled={token.isRevoked || !token.token}
              onClick={() => void handleCopy(token, "token")}
            >
              {copiedAction?.tokenId === token.id && copiedAction.action === "token" ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedAction?.tokenId === token.id && copiedAction.action === "token" ? "已复制" : "复制 Token"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 justify-center whitespace-nowrap bg-white px-3 text-xs"
              title={token.token ? "复制完整 MCP 配置" : "旧 Token 无法复制 MCP 配置"}
              aria-label={token.token ? "复制完整 MCP 配置" : "旧 Token 无法复制 MCP 配置"}
              disabled={token.isRevoked || !token.token}
              onClick={() => void handleCopy(token, "config")}
            >
              {copiedAction?.tokenId === token.id && copiedAction.action === "config" ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedAction?.tokenId === token.id && copiedAction.action === "config" ? "已复制" : "复制完整 MCP 配置"}
            </Button>
            <Button
              size="icon"
              variant="danger"
              className="h-9 w-full shrink-0 sm:w-9"
              title="删除 Token"
              aria-label="删除 Token"
              disabled={token.isRevoked || isDeleting}
              onClick={() => onDelete(token)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

interface TokenCardProps {
  name: string;
  onNameChange: (name: string) => void;
  selectedScopes: Set<string>;
  availableScopes: string[];
  createdToken: string | null;
  tokens: ApiToken[];
  isCreating: boolean;
  isLoadingTokens: boolean;
  isDeletingToken: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleScope: (scope: string) => void;
  onDeleteToken: (token: ApiToken) => void;
}

const TokenCard = ({
  name,
  onNameChange,
  selectedScopes,
  availableScopes,
  createdToken,
  tokens,
  isCreating,
  isLoadingTokens,
  isDeletingToken,
  onSubmit,
  onToggleScope,
  onDeleteToken,
}: TokenCardProps) => (
  <Card className="w-full min-w-0 overflow-hidden shadow-none">
    <CardHeader className="p-4">
      <McpTitleWithHelp />
      <CardDescription className="text-xs leading-4">为 MCP 客户端或第三方工具生成访问凭证。</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4 p-4 pt-0">
      {createdToken && <CreatedTokenNotice token={createdToken} />}

      <form className="min-w-0 space-y-4 rounded-lg border border-slate-100 bg-slate-50/70 p-3" onSubmit={onSubmit}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            className="h-9 min-w-0 flex-1 text-xs focus-visible:ring-4 focus-visible:ring-emerald-500/10"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Token 用途，例如：MCP Agent"
          />
          <Button
            size="md"
            variant="solid"
            className="h-9 w-full whitespace-nowrap bg-emerald-500 text-white hover:bg-emerald-600 sm:w-32"
            type="submit"
            disabled={isCreating}
          >
            <Plus className="h-4 w-4" />
            生成 Token
          </Button>
        </div>

        <ScopePicker
          availableScopes={availableScopes}
          selectedScopes={selectedScopes}
          onToggleScope={onToggleScope}
        />
      </form>

      <div className="space-y-3">
        <span className="block text-xs font-semibold text-slate-500">活跃 Token</span>
        <TokenList
          tokens={tokens}
          isLoading={isLoadingTokens}
          isDeleting={isDeletingToken}
          onDelete={onDeleteToken}
        />
      </div>
    </CardContent>
  </Card>
);

interface SessionCardProps {
  authRequired: boolean;
  isLoggingOut: boolean;
  onLogout: () => void;
}

const SessionCard = ({ authRequired, isLoggingOut, onLogout }: SessionCardProps) => {
  if (!authRequired) {
    return null;
  }

  return (
    <Card className="w-full min-w-0 overflow-hidden border-rose-100 bg-rose-50/30 shadow-none">
      <CardContent className="pt-6">
        <Button
          size="md"
          variant="danger"
          className="bg-rose-600 font-semibold text-white shadow-sm hover:bg-rose-700"
          disabled={isLoggingOut}
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
          {isLoggingOut ? "安全退出中..." : "退出登录"}
        </Button>
      </CardContent>
    </Card>
  );
};

export const SettingsPane = ({
  user,
  onClose,
  imageCompressionEnabled,
  onImageCompressionChange,
  onLogout,
  isLoggingOut,
  authRequired,
  onShowGuide,
}: SettingsPaneProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("MCP Agent");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(() => new Set(ALL_TOKEN_SCOPES));
  const [scopeDefaultsSynced, setScopeDefaultsSynced] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ token: string; apiToken: ApiToken } | null>(null);
  const [tokenDeleteConfirmation, setTokenDeleteConfirmation] = useState<ApiToken | null>(null);

  const tokensQuery = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.listApiTokens(),
  });

  const availableScopes = tokensQuery.data?.availableScopes ?? ALL_TOKEN_SCOPES;
  const tokens = tokensQuery.data?.apiTokens ?? [];

  useEffect(() => {
    if (scopeDefaultsSynced || !tokensQuery.data?.availableScopes) {
      return;
    }

    setSelectedScopes(new Set(tokensQuery.data.availableScopes));
    setScopeDefaultsSynced(true);
  }, [scopeDefaultsSynced, tokensQuery.data?.availableScopes]);

  const createMutation = useMutation({
    mutationFn: api.createApiToken,
    onSuccess: async (data) => {
      setCreatedToken(data);
      setName("");
      setSelectedScopes(new Set(availableScopes));
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: api.revokeApiToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const scopes = Array.from(selectedScopes);

    if (!name.trim() || scopes.length === 0) {
      return;
    }

    createMutation.mutate({ name: name.trim(), scopes });
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden bg-slate-50">
      <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-end justify-between border-b border-slate-200 bg-white px-4 pb-3 pt-[env(safe-area-inset-top)] lg:h-16 lg:items-center lg:px-6 lg:pb-0 lg:pt-0">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            title="返回上一页"
            aria-label="返回上一页"
            onClick={onClose}
            className="h-9 w-9 rounded-lg hover:bg-slate-100"
          >
            <ChevronLeft className="h-5 w-5 text-slate-500" />
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base font-bold leading-tight text-slate-900">
              <User className="h-4 w-4 text-emerald-700" />
              我的
            </h1>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-400">个人偏好、MCP Token 与登录会话</p>
          </div>
        </div>
      </header>

      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 lg:px-6 lg:py-6">
        <div className="mx-auto grid w-full min-w-0 max-w-4xl gap-4">
          <ProfileCard user={user} />
          <PreferenceCard
            imageCompressionEnabled={imageCompressionEnabled}
            onImageCompressionChange={onImageCompressionChange}
          />
          <AdvancedPlayCard />
          <EvernoteImportGuideCard onShowGuide={onShowGuide} />
          <TokenCard
            name={name}
            onNameChange={setName}
            selectedScopes={selectedScopes}
            availableScopes={availableScopes}
            createdToken={createdToken?.token ?? null}
            tokens={tokens}
            isCreating={createMutation.isPending}
            isLoadingTokens={tokensQuery.isLoading}
            isDeletingToken={deleteTokenMutation.isPending}
            onSubmit={handleSubmit}
            onToggleScope={toggleScope}
            onDeleteToken={setTokenDeleteConfirmation}
          />
          <SessionCard authRequired={authRequired} isLoggingOut={isLoggingOut} onLogout={onLogout} />
        </div>
      </div>

      {tokenDeleteConfirmation && (
        <AppConfirmDialog
          title={`确定要删除 Token「${tokenDeleteConfirmation.name}」吗？`}
          description="删除操作不可逆。一旦删除，使用此 Token 进行 API 或 MCP 调用的一切客户端将立即失效并被拒绝访问。"
          confirmLabel="确认删除"
          isWorking={deleteTokenMutation.isPending}
          tone="danger"
          onCancel={() => setTokenDeleteConfirmation(null)}
          onConfirm={() => {
            deleteTokenMutation.mutate(tokenDeleteConfirmation.id, {
              onSuccess: () => setTokenDeleteConfirmation(null),
            });
          }}
        />
      )}
    </div>
  );
};
