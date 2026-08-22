import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const mainSource = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
const noticeSource = readFileSync(new URL("../../../web/src/components/DesktopUpdateNotice.tsx", import.meta.url), "utf8");

describe("desktop update flow", () => {
  test("downloads updates in the background and relaunches after installation", () => {
    expect(mainSource).toContain("autoUpdater.autoDownload = true");
    expect(mainSource).toContain("autoUpdater.autoRunAppAfterInstall = true");
    expect(mainSource).toContain("isQuitting = true;\n  autoUpdater.quitAndInstall(false, true)");
    expect(mainSource).toContain("result?.downloadPromise?.catch");
  });

  test("only offers the restart action after the update is downloaded", () => {
    expect(noticeSource).toContain('statusQuery.data?.state === "downloaded"');
    expect(noticeSource).toContain('t("systemInfo.desktopUpdateRestart")');
    expect(noticeSource).not.toContain("downloadUpdate()");
  });
});
