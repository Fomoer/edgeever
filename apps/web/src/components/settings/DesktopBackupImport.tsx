import { useEffect, useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DesktopBackupSelection, DesktopBackupStatus } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeDesktopBackupError, useDesktopBackup } from "@/lib/desktop-backup";

type Props = { disabled: boolean; children?: (restore: (name?: string) => void, disabled: boolean) => ReactNode };
export const DesktopBackupImport = ({ disabled, children }: Props) => {
  const { t } = useTranslation();
  const { bridge, status } = useDesktopBackup();
  const [selection, setSelection] = useState<DesktopBackupSelection | null>(null);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const previousRestoreAt = useRef<string | null | undefined>(undefined);
  const importing = useRef(false);
  const preparation = useRef<Promise<DesktopBackupStatus> | null>(null);
  const scope = useRef(status?.backupSetId);
  useEffect(() => {
    scope.current = status?.backupSetId;
    importing.current = false;
    preparation.current = null;
    previousRestoreAt.current = undefined;
    setSelection(null); setPassword(""); setUnlockError(null); setError(null);
    setWorking(false); setChecking(false); setCancelling(false); setComplete(false);
  }, [status?.backupSetId]);
  useEffect(() => {
    if (status?.task?.kind === "import") {
      importing.current = true;
      if (status.task.phase === "ready") {
        setChecking(false); setSelection(null); setPassword(""); setUnlockError(null);
      }
    } else if (importing.current) {
      importing.current = false; setChecking(false);
      if (status?.importError) {
        const message = describeDesktopBackupError(t, status.importError);
        if (selection) setUnlockError(message); else setError(message);
      } else { setSelection(null); setPassword(""); }
    }
  }, [status, selection, t]);
  useEffect(() => {
    const at = status?.lastRestoreAt;
    if (!status) return;
    if (previousRestoreAt.current !== undefined && at && previousRestoreAt.current !== at && !status.importError) setComplete(true);
    previousRestoreAt.current = at;
  }, [status]);
  if (!bridge?.backup || !status) return null;
  const task = status.task?.kind === "import" ? status.task : null;
  const ready = task?.phase === "ready";
  const attempt = async (action: () => Promise<unknown>) => {
    const expected = status.backupSetId;
    setError(null); setComplete(false); setWorking(true);
    try { await action(); }
    catch (failure) { if (scope.current === expected) setError(describeDesktopBackupError(t, failure)); }
    finally { if (scope.current === expected) setWorking(false); }
  };
  const prepare = async (file: DesktopBackupSelection, value?: string) => {
    const expected = status.backupSetId;
    setError(null); setUnlockError(null); setComplete(false); setWorking(true); setChecking(true);
    importing.current = true;
    const request = bridge.backup("prepare-import", { backupSetId: expected, id: file.id, password: value });
    preparation.current = request;
    try { await request; }
    catch (failure) {
      if (scope.current !== expected) return;
      importing.current = false; setChecking(false);
      const message = describeDesktopBackupError(t, failure);
      if (file.encrypted) setUnlockError(message); else setError(message);
    } finally {
      if (preparation.current === request) preparation.current = null;
      if (scope.current === expected) setWorking(false);
    }
  };
  const closeUnlock = async () => {
    if (cancelling) return;
    const expected = status.backupSetId;
    setCancelling(true);
    try {
      // Wait for worker startup so Cancel cannot race ahead of prepare-import.
      await preparation.current?.catch(() => {});
      if (scope.current !== expected) return;
      if (checking || task) await bridge.backup("cancel", { backupSetId: expected });
      if (scope.current !== expected) return;
      importing.current = false; setChecking(false); setSelection(null); setPassword(""); setUnlockError(null);
    } catch (failure) {
      if (scope.current === expected) setUnlockError(describeDesktopBackupError(t, failure));
    } finally { if (scope.current === expected) setCancelling(false); }
  };
  const unavailable = disabled || working || checking || Boolean(status.task) || status.blocked;
  const restore = (name?: string) => { if (unavailable) return; void attempt(async () => {
    const file = name === undefined
      ? await bridge.backup("choose-import", { backupSetId: status.backupSetId })
      : await bridge.backup("select-history", { backupSetId: status.backupSetId, name });
    if (!file || scope.current !== status.backupSetId) return;
    setUnlockError(null); if (file.encrypted) setSelection(file); else await prepare(file);
  }); };
  return <>
    {children ? children(restore, unavailable) : <Button size="sm" variant="outline" type="button" disabled={unavailable} onClick={() => restore()}><Upload className="h-4 w-4" />{t("desktopBackup.importButton")}</Button>}
    <Dialog open={Boolean(selection)} onOpenChange={(open) => { if (!open) void closeUnlock(); }}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          if (selection && password && !working && !checking && !cancelling) void prepare(selection, password);
        }}>
          <DialogHeader><DialogTitle>{t("desktopBackup.decryptTitle")}</DialogTitle><DialogDescription className="break-all">{selection?.name}</DialogDescription></DialogHeader>
          <Input type="password" autoComplete="off" aria-label={t("desktopBackup.password")} aria-invalid={Boolean(unlockError)} aria-describedby={unlockError ? "desktop-backup-unlock-error" : undefined} disabled={working || checking || cancelling} value={password} onChange={(event) => setPassword(event.target.value)} />
          {unlockError ? <p id="desktop-backup-unlock-error" className="text-sm text-destructive" role="alert">{unlockError}</p> : null}
          {checking ? <p className="text-sm text-muted-foreground" role="status">{t(`desktopBackup.phases.${task?.phase ?? "checking"}`)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={cancelling} onClick={() => void closeUnlock()}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!password || working || checking || cancelling}>{t("desktopBackup.checkFile")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(task && !selection && task.phase !== "restoring")} onOpenChange={(open) => { if (!open) void attempt(() => bridge.backup("cancel", { backupSetId: status.backupSetId })); }}><DialogContent><DialogHeader><DialogTitle>{t("desktopBackup.restoreTitle")}</DialogTitle><DialogDescription>{ready ? t("desktopBackup.restoreConfirmation") : t(`desktopBackup.phases.${task?.phase ?? "checking"}`)}</DialogDescription></DialogHeader>
      {ready ? <div className="grid gap-3 text-sm"><dl className="grid gap-2"><div><dt className="text-muted-foreground">{t("desktopBackup.target")}</dt><dd className="break-all">{status.target.baseUrl}<br />{status.target.accountId}</dd></div></dl><p>{t("desktopBackup.restoreSummary", { notebooks: task?.manifest?.counts.notebooks ?? 0, prompts: task?.manifest?.counts.prompts ?? 0, memos: task?.manifest?.counts.memos ?? 0, resources: task?.manifest?.counts.resources ?? 0 })}</p></div> : <p className="text-sm text-muted-foreground" aria-live="polite">{task && task.total > 0 ? `${task.completed} / ${task.total}` : t("desktopBackup.wait")}</p>}
      <DialogFooter><Button variant="outline" onClick={() => void attempt(() => bridge.backup("cancel", { backupSetId: status.backupSetId }))}>{t("common.cancel")}</Button>{ready ? <Button onClick={() => void attempt(() => bridge.backup("confirm-import", { backupSetId: status.backupSetId }))}>{t("desktopBackup.confirmRestore")}</Button> : null}</DialogFooter>
    </DialogContent></Dialog>
    {error ? <Dialog open onOpenChange={() => setError(null)}><DialogContent><DialogHeader><DialogTitle>{t("desktopBackup.restoreIncomplete")}</DialogTitle><DialogDescription>{error}</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">{t("desktopBackup.restoreRetry")}</p><DialogFooter><Button onClick={() => setError(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog> : null}
    {status.importWarning ? <span className="text-sm text-amber-700" role="status">{describeDesktopBackupError(t, status.importWarning)}</span> : null}
    {complete ? <span className="text-xs text-emerald-700" role="status">{t("desktopBackup.restoreComplete")}</span> : null}
  </>;
};
