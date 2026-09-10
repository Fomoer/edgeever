import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const [oldAppImageInput, newAppImageInput, expectedVersion] = process.argv.slice(2);
const oldAppImage = resolve(oldAppImageInput || "");
const newAppImage = resolve(newAppImageInput || "");
if (!existsSync(oldAppImage) || !statSync(oldAppImage).isFile()) {
  throw new Error(`Old AppImage is missing: ${oldAppImage}`);
}
if (!existsSync(newAppImage) || !statSync(newAppImage).isFile()) {
  throw new Error(`New AppImage is missing: ${newAppImage}`);
}
if (!/^\d+\.\d+\.\d+$/.test(expectedVersion || "")) {
  throw new Error(`Expected version must be stable X.Y.Z: ${expectedVersion || "<missing>"}`);
}

const releaseDirectory = dirname(newAppImage);
const allowedFiles = new Set([basename(newAppImage), "latest-linux.yml"]);
const server = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname.slice(1));
  if (!allowedFiles.has(name) || name.includes("/")) {
    response.writeHead(404).end();
    return;
  }
  const path = join(releaseDirectory, name);
  const size = statSync(path).size;
  response.writeHead(200, {
    "Accept-Ranges": "bytes",
    "Content-Length": size,
    "Content-Type": name.endsWith(".yml") ? "text/yaml" : "application/octet-stream",
  });
  createReadStream(path).pipe(response);
});
await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});

const testDirectory = mkdtempSync(join(tmpdir(), "edgeever-linux-appimage-update-"));
const logPath = join(testDirectory, "logs", "desktop.log");
const output = [];
const child = spawn(oldAppImage, [], {
  env: {
    ...process.env,
    EDGE_EVER_DESKTOP_UPDATE_TEST: "1",
    EDGE_EVER_DESKTOP_UPDATE_TEST_FEED_URL: `http://127.0.0.1:${server.address().port}/`,
    EDGE_EVER_DESKTOP_UPDATE_TEST_USER_DATA: testDirectory,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

const entries = () => {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8").split(/\r?\n/).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
};
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

try {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const events = entries();
    const startedVersions = events
      .filter((entry) => entry.event === "update.test-started")
      .map((entry) => entry.version);
    if (
      startedVersions.includes(expectedVersion)
      && events.some((entry) => entry.event === "update.downloaded" && entry.version === expectedVersion)
      && events.some((entry) => entry.event === "update.not-available")
    ) {
      const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
      if (digest(oldAppImage) !== digest(newAppImage)) {
        throw new Error("The installed AppImage does not match the downloaded release AppImage");
      }
      process.stdout.write(`${JSON.stringify({ ok: true, startedVersions, installedPath: oldAppImage })}\n`);
      process.exitCode = 0;
      break;
    }
    await wait(200);
  }
  if (process.exitCode !== 0) {
    throw new Error([
      "Linux AppImage did not complete the old-to-new automatic update.",
      existsSync(logPath) && `Diagnostic log:\n${readFileSync(logPath, "utf8")}`,
      output.length > 0 && `Process output:\n${output.join("")}`,
    ].filter(Boolean).join("\n\n"));
  }
} finally {
  server.close();
  if (child.exitCode === null) child.kill("SIGTERM");
  await rm(testDirectory, { recursive: true, force: true });
}
