import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const derive = promisify(pbkdf2);
const HEADER_SIZE = 40;
const TAG_SIZE = 16;
const ITERATIONS = 600000;
export const MAX_ENCRYPTED_ARCHIVE_BYTES = 2 ** 36 - 32;
const failure = (code, message) => Object.assign(new Error(message), { code });

export const assertEncryptedArchiveSize = (size) => {
  if (size > MAX_ENCRYPTED_ARCHIVE_BYTES) throw failure("backup_too_large", "The encrypted ZIP exceeds the GCM size limit (64 GiB minus 32 bytes).");
};

const keyFor = async (password, header) => {
  if (typeof password !== "string" || password.length === 0) throw failure("backup_password_required", "A backup password is required.");
  return derive(Buffer.from(password, "utf8"), header.subarray(12, 28), ITERATIONS, 32, "sha256");
};

export async function* encryptArchive(source, password, { signal } = {}) {
  const header = Buffer.alloc(HEADER_SIZE);
  header.write("EDGB"); header.writeUInt16BE(1, 4); header[6] = 1; header[7] = 1;
  header.writeUInt32BE(ITERATIONS, 8); randomBytes(16).copy(header, 12); randomBytes(12).copy(header, 28);
  const key = await keyFor(password, header);
  try {
    signal?.throwIfAborted();
    const cipher = createCipheriv("aes-256-gcm", key, header.subarray(28, 40), { authTagLength: TAG_SIZE });
    cipher.setAAD(header);
    yield header;
    let size = 0;
    for await (const chunk of source) {
      signal?.throwIfAborted();
      size += chunk.byteLength; assertEncryptedArchiveSize(size);
      yield cipher.update(chunk);
    }
    signal?.throwIfAborted();
    yield cipher.final(); yield cipher.getAuthTag();
  } finally { key.fill(0); }
}

export const decryptArchive = async (input, destination, password, { signal } = {}) => {
  const size = (await stat(input)).size;
  if (size < HEADER_SIZE + TAG_SIZE) throw failure("backup_unsupported_container", "The encrypted backup header is incomplete.");
  assertEncryptedArchiveSize(size - HEADER_SIZE - TAG_SIZE);
  const source = await open(input, "r");
  const header = Buffer.alloc(HEADER_SIZE); const tag = Buffer.alloc(TAG_SIZE);
  try {
    await source.read(header, 0, HEADER_SIZE, 0); await source.read(tag, 0, TAG_SIZE, size - TAG_SIZE);
  } finally { await source.close(); }
  if (header.toString("ascii", 0, 4) !== "EDGB" || header.readUInt16BE(4) !== 1 || header[6] !== 1 || header[7] !== 1 || header.readUInt32BE(8) !== ITERATIONS) {
    throw failure("backup_unsupported_container", "This encrypted backup version or password suite is not supported.");
  }
  const key = await keyFor(password, header);
  let output;
  try {
    signal?.throwIfAborted();
    output = await open(destination, "wx", 0o600);
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(28, 40), { authTagLength: TAG_SIZE });
    decipher.setAAD(header); decipher.setAuthTag(tag);
    try {
      await pipeline(createReadStream(input, { start: HEADER_SIZE, end: size - TAG_SIZE - 1 }), decipher,
        createWriteStream(destination, { fd: output.fd, autoClose: false }), { signal });
      await output.sync();
    } catch (error) {
      if (signal?.aborted || ["ENOSPC", "EACCES", "EPERM", "EIO", "ENOENT"].includes(error.code)) throw error;
      throw failure("backup_decrypt_failed", "Unable to decrypt: the password is incorrect or the file is damaged.");
    }
  } catch (error) {
    if (output) { await output.close().catch(() => {}); output = null; await rm(destination, { force: true }); }
    throw error;
  } finally { key.fill(0); await output?.close(); }
};
