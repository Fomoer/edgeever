import { describe, expect, test } from "bun:test";
import { nativeReleaseAssetsReady } from "./check-native-release-assets.mjs";

describe("native release asset readiness", () => {
  const windowsAssets = (version) => [
    `EdgeEver-${version}-windows-x64.exe`,
    "latest.yml",
    "latest-windows.json",
    "latest-windows.json.sig",
    "SHA256SUMS-windows.txt",
  ];
  const linuxAssets = (version) => [
    `EdgeEver-${version}-linux-x64.AppImage`,
    "SHA256SUMS-linux.txt",
  ];

  test("accepts one reused Android APK but requires the current name after a rebuild", () => {
    const reused = ["edgeever-android-v1.6.30-arm64-v8a.apk"];
    expect(
      nativeReleaseAssetsReady({
        platform: "mobile",
        rebuild: false,
        currentTag: "v1.6.35",
        assetNames: reused,
      }),
    ).toBe(true);
    expect(
      nativeReleaseAssetsReady({
        platform: "mobile",
        rebuild: true,
        currentTag: "v1.6.35",
        assetNames: reused,
      }),
    ).toBe(false);
  });

  test("rejects duplicate Android APKs", () => {
    expect(
      nativeReleaseAssetsReady({
        platform: "mobile",
        rebuild: false,
        currentTag: "v1.6.35",
        assetNames: [
          "edgeever-android-v1.6.30-arm64-v8a.apk",
          "edgeever-android-v1.6.35-arm64-v8a.apk",
        ],
      }),
    ).toBe(false);
  });

  test("accepts a matching reused desktop asset set", () => {
    expect(
      nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: false,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: [
          "EdgeEver-1.6.33-mac-arm64.dmg",
          "EdgeEver-1.6.33-mac-arm64.dmg.blockmap",
          "EdgeEver-1.6.33-mac-arm64.zip",
          "EdgeEver-1.6.33-mac-arm64.zip.blockmap",
          "EdgeEver-1.6.33-mac-x64.dmg",
          "EdgeEver-1.6.33-mac-x64.dmg.blockmap",
          "EdgeEver-1.6.33-mac-x64.zip",
          "EdgeEver-1.6.33-mac-x64.zip.blockmap",
          "latest-mac.yml",
          ...windowsAssets("1.6.33"),
          ...linuxAssets("1.6.33"),
        ],
      }),
    ).toBe(true);
  });

  test("requires current, complete desktop assets after a rebuild", () => {
    const current = [
      "EdgeEver-1.6.35-mac-arm64.dmg",
      "EdgeEver-1.6.35-mac-arm64.dmg.blockmap",
      "EdgeEver-1.6.35-mac-arm64.zip",
      "EdgeEver-1.6.35-mac-arm64.zip.blockmap",
      "EdgeEver-1.6.35-mac-x64.dmg",
      "EdgeEver-1.6.35-mac-x64.dmg.blockmap",
      "EdgeEver-1.6.35-mac-x64.zip",
      "EdgeEver-1.6.35-mac-x64.zip.blockmap",
      "latest-mac.yml",
      ...windowsAssets("1.6.35"),
      ...linuxAssets("1.6.35"),
    ];
    expect(
      nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: true,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: current,
      }),
    ).toBe(true);
    expect(
      nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: true,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: current.slice(0, 8),
      }),
    ).toBe(false);
  });

  test("rejects a desktop set with one architecture missing", () => {
    expect(
      nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: false,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: [
          "EdgeEver-1.6.33-mac-arm64.dmg",
          "EdgeEver-1.6.33-mac-arm64.dmg.blockmap",
          "EdgeEver-1.6.33-mac-arm64.zip",
          "EdgeEver-1.6.33-mac-arm64.zip.blockmap",
          "latest-mac.yml",
          ...windowsAssets("1.6.33"),
          ...linuxAssets("1.6.33"),
        ],
      }),
    ).toBe(false);
  });

  test("allows the CI staging audit to omit only the offline signature", () => {
    const assets = [
      "EdgeEver-1.6.35-mac-arm64.dmg",
      "EdgeEver-1.6.35-mac-arm64.dmg.blockmap",
      "EdgeEver-1.6.35-mac-arm64.zip",
      "EdgeEver-1.6.35-mac-arm64.zip.blockmap",
      "EdgeEver-1.6.35-mac-x64.dmg",
      "EdgeEver-1.6.35-mac-x64.dmg.blockmap",
      "EdgeEver-1.6.35-mac-x64.zip",
      "EdgeEver-1.6.35-mac-x64.zip.blockmap",
      "latest-mac.yml",
      ...windowsAssets("1.6.35").filter((name) => name !== "latest-windows.json.sig"),
      ...linuxAssets("1.6.35"),
    ];
    expect(nativeReleaseAssetsReady({
      platform: "desktop",
      rebuild: true,
      currentTag: "v1.6.35",
      desktopVersion: "1.6.35",
      assetNames: assets,
      requireWindowsSignature: false,
    })).toBe(true);
    expect(nativeReleaseAssetsReady({
      platform: "desktop",
      rebuild: true,
      currentTag: "v1.6.35",
      desktopVersion: "1.6.35",
      assetNames: assets,
    })).toBe(false);
  });

  test("rejects missing, duplicate, or stale Linux Preview assets after a rebuild", () => {
    const base = [
      "EdgeEver-1.6.35-mac-arm64.dmg",
      "EdgeEver-1.6.35-mac-arm64.dmg.blockmap",
      "EdgeEver-1.6.35-mac-arm64.zip",
      "EdgeEver-1.6.35-mac-arm64.zip.blockmap",
      "EdgeEver-1.6.35-mac-x64.dmg",
      "EdgeEver-1.6.35-mac-x64.dmg.blockmap",
      "EdgeEver-1.6.35-mac-x64.zip",
      "EdgeEver-1.6.35-mac-x64.zip.blockmap",
      "latest-mac.yml",
      ...windowsAssets("1.6.35"),
    ];
    for (const linux of [
      [],
      [...linuxAssets("1.6.35"), "EdgeEver-1.6.34-linux-x64.AppImage"],
      linuxAssets("1.6.34"),
    ]) {
      expect(nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: true,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: [...base, ...linux],
      })).toBe(false);
    }
  });
});
