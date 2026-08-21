import { describe, expect, test } from "bun:test";
import {
  configurePackagePermissions,
  INSTALL_PACKAGES_PERMISSION,
} from "./configure-android-package-permissions.mjs";

const baseManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET"/>
  <application android:name=".MainApplication"/>
</manifest>
`;

describe("Android package permission configuration", () => {
  test("removes the sideload-only install permission from Play builds", () => {
    const configured = configurePackagePermissions(
      baseManifest.replace(
        "  <application",
        `  <uses-permission android:name="${INSTALL_PACKAGES_PERMISSION}"/>\n  <application`,
      ),
      "play",
    );

    expect(configured).not.toContain(INSTALL_PACKAGES_PERMISSION);
    expect(configured).toContain("android.permission.INTERNET");
  });

  test("adds the install permission to sideload builds", () => {
    const configured = configurePackagePermissions(baseManifest, "sideload");

    expect(configured).toContain(INSTALL_PACKAGES_PERMISSION);
  });

  test("keeps sideload configuration idempotent", () => {
    const configured = configurePackagePermissions(baseManifest, "sideload");
    const configuredAgain = configurePackagePermissions(configured, "sideload");

    expect(configuredAgain).toBe(configured);
    expect(configuredAgain.match(/REQUEST_INSTALL_PACKAGES/g)).toHaveLength(1);
  });
});
