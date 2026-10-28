import { accessSync, constants } from "node:fs";
import path from "node:path";

// Running the main macOS app executable as Node can register a foreground
// application with Launch Services. Electron's existing Helper bundle has
// LSUIElement=true and provides the same Node runtime without a Dock entry.
export function backgroundNodeExecutable(executablePath, platform = process.platform) {
  if (platform !== "darwin") return executablePath;
  const macos = path.dirname(executablePath);
  const contents = path.dirname(macos);
  if (path.basename(macos) !== "MacOS" || path.basename(contents) !== "Contents"
    || !path.dirname(contents).endsWith(".app")) return executablePath;
  const helperName = `${path.basename(executablePath)} Helper`;
  const helper = path.join(contents, "Frameworks", `${helperName}.app`, "Contents", "MacOS", helperName);
  // A malformed app bundle must fail visibly instead of silently bringing
  // foreground processes back. Plain Node executables above stay supported.
  accessSync(helper, constants.X_OK);
  return helper;
}
