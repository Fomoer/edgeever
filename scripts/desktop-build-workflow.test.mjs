import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const workflow = readFileSync(new URL("../.github/workflows/desktop-build.yml", import.meta.url), "utf8");
const mobileWorkflow = readFileSync(new URL("../.github/workflows/mobile-build.yml", import.meta.url), "utf8");
const desktopPackageVerifier = readFileSync(new URL("./verify-desktop-package.mjs", import.meta.url), "utf8");
const packagedStartupVerifier = readFileSync(new URL("./verify-packaged-desktop-startup.mjs", import.meta.url), "utf8");
const protocolE2eVerifier = readFileSync(new URL("./verify-desktop-protocol-e2e.mjs", import.meta.url), "utf8");
const cargoConfig = readFileSync(new URL("../.cargo/config.toml", import.meta.url), "utf8");
const desktopBuilderConfig = readFileSync(new URL("../apps/desktop/electron-builder.yml", import.meta.url), "utf8");

function step(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name: ", start + 1);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

describe("desktop release workflow", () => {
  test("keeps the installed application and automatic update identity stable", () => {
    expect(desktopBuilderConfig).toContain("appId: org.edgeever.desktop");
    expect(desktopBuilderConfig).toContain([
      "publish:",
      "  provider: github",
      "  owner: tianma-if",
      "  repo: edgeever",
      "  releaseType: release",
    ].join("\n"));
    expect(desktopBuilderConfig).toContain("schemes:\n      - edgeever");
    expect(desktopBuilderConfig).not.toContain("edgeever-app");
  });

  test("gates Draft release assets on the full project suite in Ubuntu", () => {
    expect(mobileWorkflow).toContain("github.repository == 'tianma-if/edgeever'");
    expect(mobileWorkflow).toContain("name: Plan Android release asset\n    runs-on: ubuntu-latest");
    const regressionTests = mobileWorkflow.indexOf("      - name: Run full project regression tests\n        run: bun run test");
    const releasePlan = mobileWorkflow.indexOf("      - name: Compare with previous formal release");
    expect(regressionTests).toBeGreaterThanOrEqual(0);
    expect(regressionTests).toBeLessThan(releasePlan);
    expect(workflow).toContain('gh release view "$CURRENT_TAG"');
    expect(mobileWorkflow).toContain('gh release view "$CURRENT_TAG"');
    expect(workflow).not.toContain('releases/tags/${CURRENT_TAG}');
    expect(mobileWorkflow).not.toContain('releases/tags/${CURRENT_TAG}');
  });

  test("rejects a published APK that is not Play-signed and restores Draft state", () => {
    expect(mobileWorkflow).toContain("github.event_name == 'release' && secrets.ANDROID_PLAY_APP_SIGNER_SHA256");
    expect(mobileWorkflow).toContain('gh release edit "$CURRENT_TAG" --repo "$GITHUB_REPOSITORY" --draft=true');
  });

  test("assigns shared validation only to the arm64 matrix job", () => {
    expect(workflow).toContain([
      "          - arch: arm64",
      "            runner: macos-15",
      "            shared_validation: true",
    ].join("\n"));
    expect(workflow).toContain([
      "          - arch: x64",
      "            runner: macos-15-intel",
      "            shared_validation: false",
    ].join("\n"));
  });

  test("runs architecture-independent checks once", () => {
    for (const name of [
      "Cache Bun dependencies for shared validation",
      "Verify Web precache budget",
      "Run project type checks",
      "Build debug sidecar for integration tests",
      "Run desktop regression tests",
      "Verify renderer origin storage migration",
      "Verify packaged renderer startup",
      "Validate Rust sidecar",
    ]) {
      expect(step(name)).toContain("        if: matrix.shared_validation\n");
    }
  });

  test("still builds and verifies each architecture-specific installer", () => {
    expect(step("Build architecture-specific Rust sidecar")).not.toContain("if: matrix.shared_validation");
    expect(step("Package desktop installer")).not.toContain("if: matrix.shared_validation");
    expect(step("Package desktop installer")).toContain("EDGE_EVER_DESKTOP_ARCH: ${{ matrix.arch }}");
    expect(step("Verify desktop installer")).not.toContain("if: matrix.shared_validation");
    expect(step("Verify packaged macOS cross-version startup")).toContain("needs.release-plan.outputs.previous_tag");
    expect(step("Verify packaged macOS cross-version startup")).toContain("verify:desktop-cross-version-startup");
    expect(step("Verify packaged macOS first launch")).not.toContain("if: matrix.shared_validation");
    expect(step("Verify packaged macOS private protocol file flows")).toContain("verify:desktop-protocol-e2e");
  });

  test("reports timings after builds without instrumenting native build steps", () => {
    expect(workflow).toContain("name: Report desktop build timings");
    expect(workflow).toContain("--platform desktop");
    expect(workflow).toContain("name: edgeever-desktop-build-timings");
    expect(mobileWorkflow).toContain("name: Report Android build timings");
    expect(mobileWorkflow).toContain("--platform android");
    expect(mobileWorkflow).toContain("name: edgeever-android-build-timings");
    expect(mobileWorkflow).not.toContain("Build signed release APK for GitHub Release\n        run: time");
  });

  test("builds an unsigned Windows x64 Preview and audits its signed update metadata", () => {
    expect(workflow).toContain("name: Windows x64 unsigned Preview");
    expect(workflow).toContain("EDGE_EVER_DESKTOP_TARGET: win");
    expect(workflow).toContain("Get-AuthenticodeSignature");
    expect(workflow).toContain("create-windows-update-metadata.mjs");
    expect(workflow).toContain("allow-missing-windows-signature");
    expect(workflow).toContain("name: Audit signed Windows update");
    expect(workflow).toContain("verify-windows-update-release.mjs");
    expect(workflow).toContain("name: Run packaged Windows sidecar integration tests");
    expect(step("Verify packaged Windows cross-version startup")).toContain("needs.release-plan.outputs.previous_tag");
    expect(step("Verify packaged Windows cross-version startup")).toContain("verify:desktop-cross-version-startup");
    expect(step("Verify packaged Windows cross-version startup")).toContain("Start-Process");
    expect(workflow).toContain("name: Verify packaged Windows first launch");
    expect(workflow).toContain("verify:packaged-desktop-startup");
    expect(step("Verify packaged Windows private protocol file flows")).toContain("verify:desktop-protocol-e2e");
    expect(protocolE2eVerifier).toContain('origin !== "edgeever-app://app"');
    expect(protocolE2eVerifier).toContain('fetch("edgeever-staged://" + pending.id)');
    expect(protocolE2eVerifier).toContain('const url = "edgeever-resource://resource/${cachedResourceId}"');
    expect(protocolE2eVerifier).toContain('DOM.setFileInputFiles');
    expect(protocolE2eVerifier).toContain('Browser.setDownloadBehavior');
    expect(packagedStartupVerifier).toContain('new Set(["renderer.origin-ready", "sidecar.ready", "renderer.bootstrap-ready"])');
    expect(packagedStartupVerifier).toContain('"renderer.origin-ready"');
    expect(packagedStartupVerifier).toContain('startsWith("edgeever-app://app/")');
    expect(desktopPackageVerifier).toContain("isVisualCppRuntimeDll");
    expect(cargoConfig).toContain('target.x86_64-pc-windows-msvc');
    expect(cargoConfig).toContain('target-feature=+crt-static');
    expect(desktopBuilderConfig).toContain([
      "nsis:",
      "  oneClick: true",
      "  perMachine: false",
    ].join("\n"));
    expect(desktopBuilderConfig).not.toContain("allowToChangeInstallationDirectory");
    expect(desktopPackageVerifier).toContain(
      'path.replaceAll("\\\\", "/")',
    );
  });

  test("builds and audits a Linux x64 AppImage Preview in parallel", () => {
    const linuxJob = workflow.slice(
      workflow.indexOf("name: Linux x64 AppImage Preview"),
      workflow.indexOf("name: Audit Linux Preview asset"),
    );
    const linuxAuditJob = workflow.slice(workflow.indexOf("name: Audit Linux Preview asset"));
    expect(workflow).toContain("name: Linux x64 AppImage Preview");
    expect(workflow).toContain("runs-on: ubuntu-22.04");
    expect(linuxJob).toContain("name: Install AppImage runtime dependencies");
    expect(linuxJob).toContain("sudo apt-get install --yes libfuse2");
    expect(workflow).toContain("EDGE_EVER_DESKTOP_TARGET: linux");
    expect(desktopBuilderConfig).toContain(
      "artifactName: EdgeEver-${version}-linux-x64.${ext}",
    );
    expect(workflow).toContain("name: Run packaged Linux sidecar integration tests");
    expect(workflow).toContain("name: Verify packaged Linux first launch");
    expect(workflow).toContain("xvfb-run -a bun run verify:packaged-desktop-startup");
    expect(step("Verify packaged Linux private protocol file flows")).toContain("xvfb-run -a bun run verify:desktop-protocol-e2e");
    expect(workflow).toContain("SHA256SUMS-linux.txt");
    expect(workflow).toContain("latest-linux.yml");
    expect(workflow).toContain("verify-linux-update-release.mjs");
    expect(step("Verify real Linux AppImage automatic update")).toContain("verify-linux-appimage-update.mjs");
    expect(step("Verify real Linux AppImage automatic update")).toContain("xvfb-run -a");
    expect(step("Build Linux automatic update predecessor")).toContain('gh release download "$PREVIOUS_TAG"');
    expect(step("Build Linux automatic update predecessor")).toContain("EdgeEver-linux-update-source.AppImage");
    expect(workflow).toContain("name: Audit Linux Preview asset");
    expect(linuxAuditJob).toContain("name: Check out source");
    expect(linuxAuditJob).toContain("uses: actions/checkout@v5");
    expect(linuxAuditJob).toContain("node scripts/verify-linux-update-release.mjs release/desktop");
    expect(workflow).toContain("needs: [release-plan, desktop, windows, linux]");
    expect(desktopPackageVerifier).toContain("verifyGlibcBaseline(sidecar)");
  });
});
