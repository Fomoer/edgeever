import { useEffect, useRef, useState } from "react";
import { ChevronRight, FolderOpen, HardDriveDownload, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DesktopBackupConfig } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AppConfirmDialog } from "@/components/dialogs/ConfirmDialogs";
import { describeDesktopBackupError, useDesktopBackup } from "@/lib/desktop-backup";
import { DesktopBackupImport } from "./DesktopBackupImport";
import { DesktopBackupRunDialog } from "./DesktopBackupRunDialog";
import { SETTINGS_CARD_DESCRIPTION_CLASSNAME, SETTINGS_CARD_HEADER_CLASSNAME, SETTINGS_CARD_ICON_CLASSNAME, SETTINGS_CARD_TITLE_CLASSNAME } from "./settings-ui";

export const DesktopScheduledBackupCard = () => {
  const { t } = useTranslation();
  const { bridge, status } = useDesktopBackup();
  const [config, setConfig] = useState<DesktopBackupConfig | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [changePassword, setChangePassword] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef(status?.backupSetId);
  const configKey = status ? JSON.stringify(status.config) : "";
  useEffect(() => {
    if (configKey) setConfig(JSON.parse(configKey) as DesktopBackupConfig);
    setPassword(""); setConfirmation(""); setChangePassword(false);
  }, [configKey, status?.backupSetId]);
  useEffect(() => {
    scope.current = status?.backupSetId;
    setRunOpen(false); setDeleting(null); setDeleteError(null); setError(null); setSaving(false);
  }, [status?.backupSetId]);
  if (!bridge?.backup || !status || !config) return null;
  if (status.blocked) return <Card className="shadow-none"><CardHeader className={SETTINGS_CARD_HEADER_CLASSNAME}><CardTitle className={SETTINGS_CARD_TITLE_CLASSNAME}><HardDriveDownload className={SETTINGS_CARD_ICON_CLASSNAME} />{t("desktopBackup.title")}</CardTitle></CardHeader><CardContent className="p-4 pt-0 sm:px-5"><p className="text-sm text-destructive" role="alert">{describeDesktopBackupError(t, status.error)}</p></CardContent></Card>;
  const busy = Boolean(status.task);
  const pending = status.pendingPublication;
  const dirty = JSON.stringify(config) !== configKey || Boolean(password);
  const passwordNeeded = config.encrypted && status.secureStorageAvailable && (!status.passwordSet || changePassword);
  const passwordValid = !passwordNeeded || (password.length > 0 && password === confirmation);
  const patch = (value: Partial<DesktopBackupConfig>) => setConfig({ ...config, ...value });
  const attempt = async (action: () => Promise<unknown>) => {
    const expected = status.backupSetId;
    setError(null); setSaving(true);
    try { await action(); } catch (failure) { if (scope.current === expected) setError(describeDesktopBackupError(t, failure)); }
    finally { if (scope.current === expected) setSaving(false); }
  };
  const date = (value: string | null) => value ? new Date(value).toLocaleString() : t("desktopBackup.never");
  const remove = async () => {
    if (!deleting || saving) return;
    const expected = status.backupSetId;
    setDeleteError(null); setSaving(true);
    try { await bridge.backup("delete-history", { backupSetId: expected, name: deleting }); if (scope.current === expected) setDeleting(null); }
    catch (failure) { if (scope.current === expected) setDeleteError(describeDesktopBackupError(t, failure)); }
    finally { if (scope.current === expected) setSaving(false); }
  };
  return <Card className="w-full min-w-0 overflow-hidden shadow-none">
    <CardHeader className={SETTINGS_CARD_HEADER_CLASSNAME}>
      <CardTitle className={SETTINGS_CARD_TITLE_CLASSNAME}><HardDriveDownload className={SETTINGS_CARD_ICON_CLASSNAME} />{t("desktopBackup.title")}</CardTitle>
      <CardDescription className={SETTINGS_CARD_DESCRIPTION_CLASSNAME}>{t("desktopBackup.scope")}</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-5 p-4 pt-0 sm:px-5">
      <DesktopBackupImport disabled={saving || runOpen || Boolean(deleting)}>{(restore, restoreDisabled) => <>
        <div className="flex flex-wrap gap-2">
          {busy ? <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void attempt(() => bridge.backup("cancel", { backupSetId: status.backupSetId }))}>{t("common.cancel")}</Button> : <Button type="button" size="sm" className="bg-foreground text-background hover:bg-foreground/90" disabled={saving || (!pending && dirty)} onClick={() => { if (pending && !pending.encrypted) void attempt(() => bridge.backup("run", { backupSetId: status.backupSetId })); else setRunOpen(true); }}>{t(pending ? "desktopBackup.verifyPublication" : "desktopBackup.run")}</Button>}
          <Button type="button" size="sm" variant="outline" disabled={restoreDisabled} onClick={() => restore()}><Upload className="h-4 w-4" />{t("desktopBackup.importButton")}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void attempt(() => bridge.backup("open-folder", { backupSetId: status.backupSetId }))}><FolderOpen className="h-4 w-4" />{t("desktopBackup.openFolder")}</Button>
        </div>
        <div className="grid gap-1.5 rounded-md bg-muted/40 p-3 text-xs" aria-live="polite" data-backup-status>
          <p className="font-medium text-slate-800">{t("desktopBackup.lastSuccess", { time: date(status.lastSuccessAt) })}</p>
          {status.task ? <p className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t(`desktopBackup.phases.${status.task.phase}`)}{status.task.total > 0 ? ` ${status.task.completed} / ${status.task.total}` : ""}</p> : status.lastCheck ? <p className="text-slate-700">{t(`desktopBackup.checkResults.${status.lastCheck.result}`)}</p> : null}
          <p className="text-muted-foreground">{t("desktopBackup.lastCheck", { time: status.lastCheck ? date(status.lastCheck.at) : t("desktopBackup.notChecked") })}</p>
          <p className="text-muted-foreground">{status.config.enabled ? t("desktopBackup.nextDue", { time: status.nextDueAt ? date(status.nextDueAt) : t("desktopBackup.whenReady") }) : t("desktopBackup.autoOff")}</p>
          {error || status.error ? <p className="break-words text-destructive" role="alert">{error ?? describeDesktopBackupError(t, status.error)}</p> : null}
          {status.warning ? <p className="text-amber-700">{describeDesktopBackupError(t, status.warning)}</p> : null}
        </div>
        <details className="group border-t pt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 select-none transition-colors hover:text-slate-900 list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-open:rotate-90" />
            <span>{t("desktopBackup.settings")}</span>
          </summary>
          <div className="mt-3.5 grid gap-3.5">
            <fieldset disabled={busy || saving} className="grid min-w-0 gap-3.5 disabled:opacity-60">
              <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700">
                <span>{t("desktopBackup.enable")}</span>
                <Switch checked={config.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
              </label>
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-slate-700">{t("desktopBackup.directory")}</span>
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 break-all rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-muted-foreground">{config.directory}/{status.backupSetId}</p>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-normal" onClick={() => void attempt(async () => { const directory = await bridge.backup("choose-directory", { backupSetId: status.backupSetId }); if (directory && scope.current === status.backupSetId) patch({ directory }); })}>{t("desktopBackup.choose")}</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  <span>{t("desktopBackup.frequency")}</span>
                  <select className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-slate-800 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900" value={config.interval} onChange={(event) => patch({ interval: event.target.value as DesktopBackupConfig["interval"] })}>
                    {(["daily", "weekly", "biweekly", "monthly"] as const).map((key) => <option key={key} value={key}>{t(`desktopBackup.intervals.${key}`)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  <span>{t("desktopBackup.retention")}</span>
                  <select className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-slate-800 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900" value={config.retention} onChange={(event) => patch({ retention: Number(event.target.value) as DesktopBackupConfig["retention"] })}>
                    {(config.retention === 10 || config.retention === 20) ? <option value={config.retention} disabled>{t("desktopBackup.copies", { count: config.retention })}</option> : null}
                    {([1, 3, 5] as const).map((count) => <option key={count} value={count}>{t("desktopBackup.copies", { count })}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3">
                <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700">
                  <span>{t("desktopBackup.encryption")}</span>
                  <Switch checked={config.encrypted} onCheckedChange={(encrypted) => patch({ encrypted })} />
                </label>
                {config.encrypted && !status.secureStorageAvailable ? <p className="text-xs text-amber-700">{t("desktopBackup.secureUnavailable")}</p> : null}
                {config.encrypted && status.passwordSet && !changePassword ? <div className="flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{t("desktopBackup.passwordSet")}</span><Button type="button" variant="ghost" size="sm" className="h-7 text-xs font-normal" onClick={() => setChangePassword(true)}>{t("desktopBackup.changePassword")}</Button></div> : null}
                {passwordNeeded ? <div className="grid gap-2"><Input className="h-8 text-xs" type="password" autoComplete="new-password" aria-label={t("desktopBackup.password")} placeholder={t("desktopBackup.password")} value={password} onChange={(event) => setPassword(event.target.value)} /><Input className="h-8 text-xs" type="password" autoComplete="new-password" aria-label={t("desktopBackup.confirmPassword")} placeholder={t("desktopBackup.confirmPassword")} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />{confirmation && password !== confirmation ? <p className="text-xs text-destructive" role="alert">{t("desktopBackup.passwordMismatch")}</p> : null}<p className="text-xs text-muted-foreground">{t("desktopBackup.passwordChangeNote")}</p></div> : null}
              </div>
            </fieldset>
            <Button className="h-8 justify-self-start text-xs font-normal" size="sm" type="button" disabled={busy || saving || !dirty || !passwordValid} onClick={() => void attempt(async () => { await bridge.backup("save", { backupSetId: status.backupSetId, config, ...(passwordNeeded ? { password } : {}) }); if (scope.current === status.backupSetId) { setPassword(""); setConfirmation(""); setChangePassword(false); } })}>{t("common.save")}</Button>
          </div>
        </details>
        <section className="grid gap-2.5 border-t pt-3" aria-label={t("desktopBackup.history", { count: status.history.length })}>
          <h3 className="text-xs font-medium text-slate-700">{t("desktopBackup.history", { count: status.history.length })}</h3>
          {status.history.length ? <ul className="divide-y divide-slate-100">{[...status.history].reverse().map((item) => <li key={item.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><p className="break-all font-mono text-xs text-slate-800">{item.name}</p><p className="text-xs text-muted-foreground">{date(item.completedAt)} · {(item.size / 1048576).toFixed(1)} MiB · {t(item.encrypted ? "desktopBackup.encrypted" : "desktopBackup.plain")}</p></div>
            <div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" className="h-7 text-xs font-normal" disabled={restoreDisabled} onClick={() => restore(item.name)}>{t("desktopBackup.restore")}</Button><Button size="sm" variant="ghost" className="h-7 text-xs font-normal text-destructive hover:text-destructive" disabled={busy || saving} onClick={() => { setDeleteError(null); setDeleting(item.name); }}>{t("common.delete")}</Button></div>
          </li>)}</ul> : <p className="text-xs text-muted-foreground">{t("desktopBackup.emptyHistory")}</p>}
        </section>
      </>}</DesktopBackupImport>
    </CardContent>
    {runOpen ? <DesktopBackupRunDialog key={status.backupSetId} status={status} onRun={(input) => bridge.backup("run", input)} onClose={() => setRunOpen(false)} /> : null}
    {deleting ? <AppConfirmDialog title={t("desktopBackup.deleteTitle")} description={t("desktopBackup.deleteDescription", { name: deleting })} confirmLabel={t("desktopBackup.deleteConfirm")} error={deleteError} isWorking={saving} onCancel={() => setDeleting(null)} onConfirm={() => void remove()} /> : null}
  </Card>;
};
