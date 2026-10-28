import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopBackupActions, DesktopBackupStatus } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeDesktopBackupError } from "@/lib/desktop-backup";

const defaultName = () => {
  const date = new Date();
  const two = (value: number) => String(value).padStart(2, "0");
  return `EdgeEver-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}_${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
};

export const DesktopBackupRunDialog = ({ status, onRun, onClose }: {
  status: DesktopBackupStatus;
  onRun: (input: DesktopBackupActions["run"]["input"]) => Promise<unknown>;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const pending = status.pendingPublication;
  const [name, setName] = useState(defaultName);
  const [encrypted, setEncrypted] = useState(pending?.encrypted ?? status.config.encrypted);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsPassword = encrypted && (Boolean(pending) || !status.passwordSet || !status.secureStorageAvailable);
  const valid = (pending || name.trim()) && (!needsPassword || password) && (pending || !encrypted || !password || password === confirmation);
  const run = async () => {
    if (!valid || working) return;
    setWorking(true); setError(null);
    try {
      await onRun({ backupSetId: status.backupSetId, ...(encrypted && password ? { password } : {}), ...(!pending ? { options: { name, encrypted } } : {}) });
      onClose();
    } catch (failure) { setError(describeDesktopBackupError(t, failure)); setWorking(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !working) onClose(); }}><DialogContent>
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <DialogHeader>
        <DialogTitle>{t(pending ? "desktopBackup.verifyPublication" : "desktopBackup.run")}</DialogTitle>
        <DialogDescription className="break-all">{pending ? t("desktopBackup.verifyPassword", { name: pending.name }) : status.actualDirectory}</DialogDescription>
      </DialogHeader>
      {!pending ? <>
        <label className="grid gap-2 text-sm font-medium"><span>{t("desktopBackup.fileName")}</span><div className="flex items-center gap-2"><Input autoFocus value={name} disabled={working} onChange={(event) => setName(event.target.value)} /><span className="shrink-0 text-muted-foreground">{encrypted ? ".edgeever.enc" : ".zip"}</span></div></label>
        <label className="flex items-center justify-between gap-3 text-sm font-medium"><span>{t("desktopBackup.encryption")}</span><Switch checked={encrypted} disabled={working} onCheckedChange={(value) => { setEncrypted(value); setPassword(""); setConfirmation(""); }} /></label>
      </> : null}
      {encrypted ? <div className="grid gap-2">
        <Input type="password" autoComplete="off" aria-label={t("desktopBackup.password")} placeholder={t(needsPassword ? "desktopBackup.password" : "desktopBackup.savedPasswordPlaceholder")} disabled={working} value={password} onChange={(event) => setPassword(event.target.value)} />
        {!pending && (needsPassword || password) ? <Input type="password" autoComplete="off" aria-label={t("desktopBackup.confirmPassword")} placeholder={t("desktopBackup.confirmPassword")} disabled={working} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /> : null}
        {!pending && confirmation && password !== confirmation ? <p className="text-sm text-destructive" role="alert">{t("desktopBackup.passwordMismatch")}</p> : null}
        {!pending ? <p className="text-sm text-muted-foreground">{t("desktopBackup.oncePassword")}</p> : null}
      </div> : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <DialogFooter><Button type="button" variant="outline" disabled={working} onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" className="bg-foreground text-background hover:bg-foreground/90" disabled={!valid || working}>{t(working ? "common.processing" : pending ? "desktopBackup.verifyPublication" : "desktopBackup.run")}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
};
