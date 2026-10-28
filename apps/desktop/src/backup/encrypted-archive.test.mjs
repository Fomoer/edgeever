import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptArchive, decryptArchive, assertEncryptedArchiveSize, MAX_ENCRYPTED_ARCHIVE_BYTES } from "./encrypted-archive.mjs";

const directories = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
const directory = async () => { const path = await mkdtemp(join(tmpdir(), "edgeever-encryption-")); directories.push(path); return path; };
const encode = async (bytes, password) => {
  const parts = [];
  for await (const chunk of encryptArchive((async function* () { yield bytes.subarray(0, 3); yield bytes.subarray(3); })(), password)) parts.push(chunk);
  return Buffer.concat(parts);
};

test("EDGB v1 authenticates its exact header and preserves Unicode and whitespace passwords", async () => {
  const path = await directory();
  const bytes = Buffer.from("A portable ZIP stream\n".repeat(100));
  const password = "  备份 café  ";
  const first = await encode(bytes, password);
  const second = await encode(bytes, password);
  expect(first.subarray(0, 4).toString()).toBe("EDGB");
  expect(first.readUInt16BE(4)).toBe(1);
  expect(first.readUInt32BE(8)).toBe(600000);
  expect(first.length).toBe(bytes.length + 56);
  expect(first.subarray(12, 40).equals(second.subarray(12, 40))).toBe(false);
  const input = join(path, "backup.edgeever.enc");
  const output = join(path, "restored.zip");
  await writeFile(input, first);
  await decryptArchive(input, output, password);
  expect(await readFile(output)).toEqual(bytes);
  if (process.platform !== "win32") expect((await stat(output)).mode & 0o777).toBe(0o600);
  await expect(decryptArchive(input, join(path, "wrong.zip"), password.trim())).rejects.toMatchObject({ code: "backup_decrypt_failed" });
  await expect(stat(join(path, "wrong.zip"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("rejects tampered, truncated and unsupported containers without leaving plaintext", async () => {
  const path = await directory();
  const valid = await encode(Buffer.from("authenticated payload"), "password");
  for (const [name, mutate] of [
    ["salt", (data) => { data[12] ^= 1; }],
    ["ciphertext", (data) => { data[40] ^= 1; }],
    ["suite", (data) => { data[6] = 9; }],
    ["iterations", (data) => { data.writeUInt32BE(1, 8); }],
  ]) {
    const bytes = Buffer.from(valid); mutate(bytes);
    const input = join(path, `${name}.enc`); const output = join(path, `${name}.zip`);
    await writeFile(input, bytes);
    await expect(decryptArchive(input, output, "password")).rejects.toBeDefined();
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
  }
  const short = join(path, "short.enc"); await writeFile(short, valid.subarray(0, 30));
  await expect(decryptArchive(short, join(path, "short.zip"), "password")).rejects.toMatchObject({ code: "backup_unsupported_container" });
});

test("honors the GCM limit and does not remove an existing destination", async () => {
  expect(MAX_ENCRYPTED_ARCHIVE_BYTES).toBe(64 * 1024 ** 3 - 32);
  expect(() => assertEncryptedArchiveSize(MAX_ENCRYPTED_ARCHIVE_BYTES)).not.toThrow();
  expect(() => assertEncryptedArchiveSize(MAX_ENCRYPTED_ARCHIVE_BYTES + 1)).toThrow();
  const path = await directory(); const input = join(path, "input.enc"); const output = join(path, "existing.zip");
  await writeFile(input, await encode(Buffer.from("payload"), "password"));
  await writeFile(output, "preserve me");
  await expect(decryptArchive(input, output, "password")).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readFile(output, "utf8")).toBe("preserve me");
});
