import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { verifyLinuxUpdateRelease } from "./verify-linux-update-release.mjs";

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const fixture = async ({ metadataSha512, checksumSha256 } = {}) => {
  const directory = await mkdtemp(join(tmpdir(), "edgeever-linux-update-"));
  directories.push(directory);
  const version = "1.62.0";
  const name = `EdgeEver-${version}-linux-x64.AppImage`;
  const content = Buffer.from("real-appimage-bytes");
  const sha512 = createHash("sha512").update(content).digest("base64");
  const sha256 = createHash("sha256").update(content).digest("hex");
  await writeFile(join(directory, name), content);
  await writeFile(join(directory, "latest-linux.yml"), [
    `version: ${version}`,
    "files:",
    `  - url: ${name}`,
    `    sha512: ${metadataSha512 || sha512}`,
    `    size: ${content.length}`,
    "    blockMapSize: 123",
    `path: ${name}`,
    `sha512: ${metadataSha512 || sha512}`,
    "releaseDate: '2026-09-09T00:00:00.000Z'",
    "",
  ].join("\n"));
  await writeFile(join(directory, "SHA256SUMS-linux.txt"), `${checksumSha256 || sha256}  ${name}\n`);
  return { directory, version };
};

describe("Linux automatic update release", () => {
  test("accepts metadata and checksums that exactly match the AppImage", async () => {
    const input = await fixture();
    expect(verifyLinuxUpdateRelease({ directory: input.directory, expectedVersion: input.version }))
      .toMatchObject({ version: input.version });
  });

  test("rejects stale updater metadata", async () => {
    const input = await fixture({ metadataSha512: "stale" });
    expect(() => verifyLinuxUpdateRelease({ directory: input.directory, expectedVersion: input.version }))
      .toThrow("does not match");
  });

  test("rejects a checksum from another AppImage", async () => {
    const input = await fixture({ checksumSha256: "0".repeat(64) });
    expect(() => verifyLinuxUpdateRelease({ directory: input.directory, expectedVersion: input.version }))
      .toThrow("does not exactly match");
  });

  test("rejects metadata that can select an extra update file", async () => {
    const input = await fixture();
    const path = join(input.directory, "latest-linux.yml");
    const metadata = await Bun.file(path).text();
    await writeFile(path, metadata.replace("files:\n", "files:\n  - url: unexpected.AppImage\n"));
    expect(() => verifyLinuxUpdateRelease({ directory: input.directory, expectedVersion: input.version }))
      .toThrow("exactly one");
  });
});
