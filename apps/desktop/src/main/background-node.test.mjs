import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { backgroundNodeExecutable } from "./background-node.mjs";

test("keeps Windows, Linux and standalone Node runtimes unchanged", () => {
  for (const [executable, platform] of [["C:\\EdgeEver\\EdgeEver.exe", "win32"], ["/opt/EdgeEver/edgeever", "linux"], ["/usr/bin/node", "darwin"]]) {
    expect(backgroundNodeExecutable(executable, platform)).toBe(executable);
  }
});

test("selects the bundled background Helper and rejects a broken app bundle", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "edgeever-background-node-"));
  const executable = path.join(root, "Edge Ever.app/Contents/MacOS/Edge Ever");
  const helper = path.join(root, "Edge Ever.app/Contents/Frameworks/Edge Ever Helper.app/Contents/MacOS/Edge Ever Helper");
  try {
    expect(() => backgroundNodeExecutable(executable, "darwin")).toThrow();
    await mkdir(path.dirname(helper), { recursive: true });
    await writeFile(helper, "#!/bin/sh\n", { mode: 0o755 });
    expect(backgroundNodeExecutable(executable, "darwin")).toBe(helper);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.skipIf(process.platform !== "darwin")("real Electron Helper runs npm and stays out of Dock", async () => {
  const require = createRequire(import.meta.url);
  const helper = backgroundNodeExecutable(require("electron"));
  const npm = path.join(path.dirname(require.resolve("npm")), "bin/npm-cli.js");
  const root = await mkdtemp(path.join(tmpdir(), "edgeever-background-npm-"));
  let child;
  try {
    const fixture = path.join(root, "fixture");
    await mkdir(fixture);
    await writeFile(path.join(fixture, "package.json"), JSON.stringify({ name: "edgeever-background-fixture", version: "1.0.0" }));
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
    execFileSync(helper, [npm, "install", "--prefix", path.join(root, "installed"), "--offline", "--ignore-scripts", "--no-audit", "--no-fund", fixture], { env, timeout: 30_000, stdio: "pipe" });
    child = spawn(helper, ["-e", "process.title = 'edgeever-background-fixture'; console.log('ready'); setInterval(() => {}, 1000)"], { env, stdio: ["ignore", "pipe", "pipe"] });
    await once(child.stdout, "data");
    // Query only this test process; never enumerate app names or command lines.
    const policy = execFileSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", `ObjC.import('AppKit'); var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}); app.isNil() ? -1 : Number(app.activationPolicy);`], { encoding: "utf8", timeout: 5_000 }).trim();
    expect(["-1", "1", "2"]).toContain(policy);
    expect(child.exitCode).toBeNull();
  } finally {
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    await rm(root, { recursive: true, force: true });
  }
}, 40_000);
