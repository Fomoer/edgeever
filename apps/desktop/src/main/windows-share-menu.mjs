import { join } from "node:path";
import { desktopDialogCopy } from "./desktop-copy.mjs";

export const WINDOWS_SHARE_MENU_KEY = "HKCU\\Software\\Classes\\*\\shell\\EdgeEver";

export const windowsShareMenuLabel = (locale) => desktopDialogCopy(locale).shareMenuLabel;

export const windowsShareCommand = (exePath) => `"${exePath}" --share-file "%1"`;

export const shareFilePathsFromCommandLine = (commandLine) => {
  if (!Array.isArray(commandLine)) return [];
  const paths = [];
  for (let index = 0; index < commandLine.length; index += 1) {
    if (commandLine[index] !== "--share-file") continue;
    const filePath = commandLine[index + 1];
    if (typeof filePath === "string" && filePath && !filePath.startsWith("-")) paths.push(filePath);
    index += 1;
  }
  return paths;
};

export const windowsShareRegPath = (systemRoot = process.env.SystemRoot || "C:\\Windows") =>
  join(systemRoot, "System32", "reg.exe");

export const windowsShareMenuCommands = (exePath, locale) => {
  const label = windowsShareMenuLabel(locale);
  const command = windowsShareCommand(exePath);
  return [
    ["add", WINDOWS_SHARE_MENU_KEY, "/ve", "/d", label, "/f"],
    ["add", WINDOWS_SHARE_MENU_KEY, "/v", "Icon", "/d", `"${exePath}",0`, "/f"],
    ["add", WINDOWS_SHARE_MENU_KEY, "/v", "MultiSelectModel", "/d", "Document", "/f"],
    ["add", `${WINDOWS_SHARE_MENU_KEY}\\command`, "/ve", "/d", command, "/f"],
  ];
};

const runReg = (execFile, regPath, args) => new Promise((resolve, reject) => {
  execFile(regPath, args, { timeout: 10_000, windowsHide: true }, (error) => {
    if (error) reject(error);
    else resolve();
  });
});

// Windows 11 keeps this verb under "Show more options". The command points at
// the installed executable so a right-click can hand the selected file over.
export const registerWindowsShareMenu = async ({
  platform,
  packaged,
  exePath,
  locale,
  execFile,
  regPath = windowsShareRegPath(),
}) => {
  if (platform !== "win32" || !packaged || typeof exePath !== "string" || !exePath) return { registered: false };
  for (const args of windowsShareMenuCommands(exePath, locale)) {
    await runReg(execFile, regPath, args);
  }
  return { registered: true };
};
