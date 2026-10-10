import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

test("the injected page capture is a standalone classic script", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "edgeever-capture-"));
  try {
    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
      "build",
      "--config",
      fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
      "--outDir",
      outDir,
      "--logLevel",
      "silent",
    ]);

    const capture = await readFile(join(outDir, "assets/capture.js"), "utf8");
    expect(() => new Script(capture)).not.toThrow();
    expect(capture).toContain("capturedPage");
    const platform = await readFile(join(outDir, "assets/capture-platform.js"), "utf8");
    expect(() => new Script(platform)).not.toThrow();
    expect(platform).toContain("pagePlatformRead");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
