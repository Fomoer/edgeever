import { BadgeCheck, Download, Play, Settings2, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { GitHubMark, GitHubRepositoryLink } from "@/components/GitHubRepositoryLink";
import {
  canReplaceWithVerifiedMarketplace,
  getPluginCatalogDescription,
  getPluginCatalogName,
  getPluginCatalogRepositoryUrl,
  getPluginCatalogSourceKey,
  getPluginCatalogVersion,
  type PluginCatalogItem,
} from "@/lib/plugins/plugin-catalog";
import { getPluginDetailPath, hasPluginSettings, isPluginCardCommand } from "@/lib/plugins/plugin-navigation";
import type { PluginUpdateInfo } from "@/lib/plugins/plugin-updates";
import type { RegisteredPluginCommand } from "@/lib/plugins/plugin-host";

const permissionLabel = (permission: string) => permission.replace(":", " · ");

const sourceBadgeClassName = (sourceKey: ReturnType<typeof getPluginCatalogSourceKey>) =>
  sourceKey === "github" || sourceKey === "manifest"
    ? "bg-amber-50 text-amber-700"
    : "bg-emerald-50 text-emerald-700";

export const PluginCatalogCard = ({
  item,
  update,
  commands,
  pendingId,
  onOpenPlugin,
  onToggle,
  onInstallMarketplace,
  onUpdate,
  onRunCommand,
  onUninstall,
}: {
  item: PluginCatalogItem;
  update?: PluginUpdateInfo;
  commands: RegisteredPluginCommand[];
  pendingId: string | null;
  onOpenPlugin?: (pluginId: string) => void;
  onToggle: (enabled: boolean) => void;
  onInstallMarketplace: () => void;
  onUpdate: () => void;
  onRunCommand: (command: RegisteredPluginCommand) => void;
  onUninstall: () => void;
}) => {
  const { t } = useTranslation();
  const extension = item.extension;
  const name = getPluginCatalogName(item);
  const description = getPluginCatalogDescription(item);
  const repositoryUrl = getPluginCatalogRepositoryUrl(item);
  const version = getPluginCatalogVersion(item);
  const sourceKey = getPluginCatalogSourceKey(item);
  const marketplaceActionId = `marketplace:${item.id}`;
  const replaceWithVerified = canReplaceWithVerifiedMarketplace(item);

  return (
    <article
      role={extension ? "link" : undefined}
      tabIndex={extension ? 0 : undefined}
      aria-label={extension ? t("plugins.details.open", { name }) : undefined}
      className={`flex min-w-0 flex-col rounded-lg border border-slate-200 bg-card p-3 ${
        extension
          ? "cursor-pointer transition-colors hover:border-emerald-300 hover:bg-emerald-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
          : ""
      }`}
      onClick={extension ? (event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        onOpenPlugin?.(item.id);
      } : undefined}
      onKeyDown={extension ? (event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpenPlugin?.(item.id);
        }
      } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-900">{name}</span>
            {extension ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {extension.manifest.type}
              </span>
            ) : null}
            {extension && version ? <span className="text-[11px] text-slate-400">v{version}</span> : null}
            {sourceKey === "official" ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {t("plugins.marketplace.officialAutoUpdate")}
              </span>
            ) : sourceKey ? (
              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${sourceBadgeClassName(sourceKey)}`}>
                {sourceKey === "verified" ? <BadgeCheck className="h-3 w-3" /> : sourceKey === "github" ? <GitHubMark className="h-3 w-3" /> : null}
                {t(`plugins.sources.${sourceKey}`)}
              </span>
            ) : null}
            {update ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {t("plugins.updates.available", { version: update.latestVersion })}
              </span>
            ) : null}
          </div>
          {!extension && item.marketplaceEntry ? (
            <div className="mt-0.5 text-[10px] text-slate-400">
              {item.marketplaceEntry.author} · {item.marketplaceEntry.category}{version ? ` · v${version}` : ""}
            </div>
          ) : null}
          {description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {repositoryUrl ? (
            <GitHubRepositoryLink
              href={repositoryUrl}
              label={t("plugins.marketplace.openRepository", { name })}
              showTooltip={false}
              className="h-7 w-7 justify-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              iconClassName="h-3.5 w-3.5"
            />
          ) : null}
          {extension ? (
            <Switch
              aria-label={t("plugins.toggle", { name })}
              checked={extension.enabled}
              disabled={pendingId === item.id}
              onCheckedChange={onToggle}
            />
          ) : null}
        </div>
      </div>

      {extension?.manifest.type === "plugin" && extension.manifest.permissions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {extension.manifest.permissions.slice(0, 3).map((permission) => (
            <span key={permission} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
              {permission === "network:public" ? t("plugins.permissions.publicNetwork") : permissionLabel(permission)}
            </span>
          ))}
          {extension.manifest.permissions.length > 3 ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
              +{extension.manifest.permissions.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      {extension?.error ? <div className="mt-2 text-xs text-rose-600">{extension.error}</div> : null}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {extension && hasPluginSettings(extension.manifest) ? (
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Link to={getPluginDetailPath(item.id, "settings")} aria-label={t("plugins.settings.open", { name })}>
              <Settings2 className="h-3.5 w-3.5" />
              {t("plugins.settings.title")}
            </Link>
          </Button>
        ) : null}
        {update ? (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={pendingId === `update:${item.id}`}
            onClick={onUpdate}
          >
            <Download className="h-3.5 w-3.5" />
            {t("plugins.updates.update")}
          </Button>
        ) : null}
        {!extension && item.marketplaceEntry ? (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={pendingId === marketplaceActionId}
            onClick={onInstallMarketplace}
          >
            <Download className="h-3.5 w-3.5" />
            {pendingId === marketplaceActionId ? t("plugins.installing") : t("plugins.install")}
          </Button>
        ) : null}
        {replaceWithVerified && !update ? (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={pendingId === marketplaceActionId}
            onClick={onInstallMarketplace}
          >
            <Download className="h-3.5 w-3.5" />
            {pendingId === marketplaceActionId ? t("plugins.installing") : t("plugins.marketplace.installVerified")}
          </Button>
        ) : null}
        {extension ? commands.filter(isPluginCardCommand).map((command) => (
          <Button
            key={command.id}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={pendingId === `${item.id}:${command.id}`}
            onClick={() => onRunCommand(command)}
          >
            <Play className="h-3.5 w-3.5" />
            {command.title}
          </Button>
        )) : null}
        {extension ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-8 gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={pendingId === `remove:${item.id}`}
            onClick={onUninstall}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("plugins.uninstall")}
          </Button>
        ) : null}
      </div>
    </article>
  );
};
