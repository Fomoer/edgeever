import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STABLE_VERSION = /^\d+\.\d+\.\d+$/;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hashFile = (path, algorithm, encoding) =>
  createHash(algorithm).update(readFileSync(path)).digest(encoding);

export const verifyLinuxUpdateRelease = ({ directory, expectedVersion }) => {
  const metadataPath = join(directory, "latest-linux.yml");
  const metadata = readFileSync(metadataPath, "utf8");
  const version = metadata.match(/^version:\s*([^\s]+)\s*$/m)?.[1];
  if (!version || !STABLE_VERSION.test(version)) {
    throw new Error("latest-linux.yml must contain a stable X.Y.Z version");
  }
  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`Linux update version ${version} does not match ${expectedVersion}`);
  }

  const appImageName = `EdgeEver-${version}-linux-x64.AppImage`;
  const appImagePath = join(directory, appImageName);
  const stats = statSync(appImagePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Linux AppImage is missing or empty: ${appImagePath}`);
  }
  const sha512 = hashFile(appImagePath, "sha512", "base64");
  const sha256 = hashFile(appImagePath, "sha256", "hex");
  const escapedName = escapeRegExp(appImageName);
  const updateUrls = [...metadata.matchAll(/^  - url:\s*(.+)\s*$/gm)].map((match) => match[1]);
  if (updateUrls.length !== 1 || updateUrls[0] !== appImageName) {
    throw new Error("latest-linux.yml must select exactly one expected AppImage");
  }
  const fileEntry = new RegExp(
    `^  - url: ${escapedName}\\n    sha512: ${escapeRegExp(sha512)}\\n    size: ${stats.size}\\n    blockMapSize: [1-9]\\d*$`,
    "m",
  );
  if (!fileEntry.test(metadata)) {
    throw new Error("latest-linux.yml does not match the AppImage digest, size, and block map");
  }
  if ((metadata.match(/^path:/gm) || []).length !== 1 || !new RegExp(`^path: ${escapedName}$`, "m").test(metadata)) {
    throw new Error("latest-linux.yml path does not select the expected AppImage");
  }
  if ((metadata.match(/^sha512:/gm) || []).length !== 1 || !new RegExp(`^sha512: ${escapeRegExp(sha512)}$`, "m").test(metadata)) {
    throw new Error("latest-linux.yml top-level digest does not match the AppImage");
  }

  const checksum = readFileSync(join(directory, "SHA256SUMS-linux.txt"), "utf8");
  if (checksum !== `${sha256}  ${appImageName}\n`) {
    throw new Error("SHA256SUMS-linux.txt does not exactly match the AppImage");
  }
  return { version, appImageName, size: stats.size, sha512, sha256 };
};

const run = () => {
  const [directoryValue, expectedVersion] = process.argv.slice(2);
  if (!directoryValue) {
    throw new Error("Usage: node scripts/verify-linux-update-release.mjs <directory> [version]");
  }
  const result = verifyLinuxUpdateRelease({
    directory: resolve(directoryValue),
    expectedVersion,
  });
  process.stdout.write(`${basename(directoryValue)}: ${result.appImageName}\n`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
