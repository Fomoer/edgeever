import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const INSTALL_PACKAGES_PERMISSION =
  "android.permission.REQUEST_INSTALL_PACKAGES";

export function configurePackagePermissions(manifest, target) {
  if (target !== "play" && target !== "sideload") {
    throw new Error(`Unsupported Android distribution target: ${target}`);
  }

  const permissionPattern = new RegExp(
    `^[\\t ]*<uses-permission\\s+android:name=["']${INSTALL_PACKAGES_PERMISSION}["'][^>]*\\/?>[\\t ]*\\r?\\n?`,
    "gm",
  );
  const withoutInstallPermission = manifest.replace(permissionPattern, "");

  if (target === "play") {
    return withoutInstallPermission;
  }

  const manifestOpenTag = /<manifest\b[^>]*>\r?\n/;
  if (!manifestOpenTag.test(withoutInstallPermission)) {
    throw new Error("Android manifest is missing its opening <manifest> tag");
  }

  return withoutInstallPermission.replace(
    manifestOpenTag,
    (openTag) =>
      `${openTag}  <uses-permission android:name="${INSTALL_PACKAGES_PERMISSION}"/>\n`,
  );
}

export async function configureManifestFile(manifestPath, target) {
  const original = await readFile(manifestPath, "utf8");
  const configured = configurePackagePermissions(original, target);
  if (configured !== original) {
    await writeFile(manifestPath, configured);
  }
}

async function main(argv) {
  const [manifestPath, target] = argv;
  if (!manifestPath || !target) {
    throw new Error(
      "Usage: node scripts/configure-android-package-permissions.mjs <AndroidManifest.xml> <play|sideload>",
    );
  }
  await configureManifestFile(manifestPath, target);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
