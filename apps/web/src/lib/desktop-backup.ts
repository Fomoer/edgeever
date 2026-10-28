import { useEffect, useState } from "react";
import type { DesktopBackupStatus, DesktopBackupError } from "@edgeever/shared";
import type { TFunction } from "i18next";

export const useDesktopBackup = () => {
  const [status, setStatus] = useState<DesktopBackupStatus | null>(null);
  const bridge = window.edgeeverDesktop;
  useEffect(() => {
    if (!bridge?.backup) return;
    let active = true;
    const unsubscribe = bridge.onBackupStatus((value) => { if (active) setStatus(value); });
    void bridge.backup("status").then((value) => { if (active) setStatus(value); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  return { bridge, status };
};

const archiveErrors = new Set(["invalidZip", "missingManifest", "unsupportedFormat", "unsupportedVersion", "invalidManifest", "missingData", "invalidData", "incompleteData", "incompleteResources"]);
const cleanupErrors: Record<string, string> = { backup_cleanup_failed: "cleanupWarning", backup_staging_cleanup_failed: "stagingWarning", backup_part_cleanup_failed: "partWarning" };

export const describeDesktopBackupError = (t: TFunction, error: unknown) => {
  const value = error as DesktopBackupError;
  if (archiveErrors.has(value?.code)) return t(`dataExport.importErrors.${value.code}`);
  if (cleanupErrors[value?.code]) return t(`desktopBackup.${cleanupErrors[value.code]}`);
  const description = value?.status && value.code === "backup_request_failed" && value.message
    ? value.message
    : t(`desktopBackup.errors.${value?.code ?? "backup_failed"}`, { defaultValue: value?.message || t("desktopBackup.errors.backup_failed") });
  return value?.status ? t("desktopBackup.httpError", { message: description, status: value.status }) : description;
};
