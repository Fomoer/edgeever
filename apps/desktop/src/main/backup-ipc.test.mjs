import { expect, test } from "bun:test";
import { registerBackupIpc } from "./backup-ipc.mjs";

const fixture = () => {
  let handler; const frame = {}; const webContents = { mainFrame: frame };
  const calls = []; const dialogs = [];
  const status = { backupSetId: "set-A", actualDirectory: "/configured/backups/set-A" };
  registerBackupIpc({ ipcMain: { handle: (channel, value) => { expect(channel).toBe("desktop:backup"); handler = value; } }, getWindow: () => ({ webContents }),
    manager: { status: () => status, selectImport: async (path) => { calls.push(path); return { id: "opaque-file-selection", name: "archive.zip", encrypted: false }; }, save: async () => { throw Object.assign(new Error("Locked"), { code: "backup_secure_storage_unavailable" }); } },
    dialog: { showOpenDialog: async (_window, options) => { dialogs.push(options); return { canceled: false, filePaths: ["/native/selected/archive.zip"] }; } }, shell: {},
  });
  return { invoke: (...args) => handler(...args), event: { sender: webContents, senderFrame: frame }, calls, dialogs, status };
};

test("restricts backup IPC to the main window and main frame", async () => {
  const f = fixture();
  await expect(f.invoke({ ...f.event, sender: {} }, "choose-import")).rejects.toThrow("main frame");
  await expect(f.invoke({ ...f.event, senderFrame: {} }, "choose-import")).rejects.toThrow("main frame");
  expect(f.calls).toHaveLength(0);
});
test("selects files only through the native dialog and preserves actionable error codes", async () => {
  const f = fixture();
  const result = await f.invoke(f.event, "choose-import", { backupSetId: "set-A", path: "/arbitrary/not-allowed.zip" });
  expect(f.dialogs[0].defaultPath).toBe("/configured/backups/set-A");
  expect(f.calls).toEqual(["/native/selected/archive.zip"]);
  expect(result.value).toEqual({ id: "opaque-file-selection", name: "archive.zip", encrypted: false });
  expect(JSON.stringify(result)).not.toContain("/native/");
  f.status.actualDirectory = "/changed/backups/set-A";
  await f.invoke(f.event, "choose-import", { backupSetId: "set-A" });
  expect(f.dialogs[1].defaultPath).toBe("/changed/backups/set-A");
  expect(f.calls).toEqual(["/native/selected/archive.zip", "/native/selected/archive.zip"]);
  expect(await f.invoke(f.event, "save", { backupSetId: "set-A" })).toEqual({ ok: false, error: { code: "backup_secure_storage_unavailable", message: "Locked" } });
});

test("rejects settings actions from a previously displayed account", async () => {
  const f = fixture();
  expect(await f.invoke(f.event, "save", { backupSetId: "previous-account" })).toMatchObject({ ok: false, error: { code: "backup_account_changed" } });
});
