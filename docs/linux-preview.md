# Linux AppImage Preview

EdgeEver provides an x86_64 AppImage Preview on each formal GitHub Release.
The package is built and verified on Ubuntu 22.04 to keep the Rust sidecar at a
glibc 2.35 baseline. Newer Ubuntu releases, Debian 12, and current Fedora
releases are expected to work but remain best-effort during the Preview.

Download `EdgeEver-<version>-linux-x64.AppImage` and
`SHA256SUMS-linux.txt` from the same official Release, then run:

```bash
sha256sum --check SHA256SUMS-linux.txt
chmod +x EdgeEver-*-linux-x64.AppImage
./EdgeEver-*-linux-x64.AppImage
```

The checksum detects a damaged or mismatched download; it is not a code-signing
identity. Do not download the Preview from third-party mirrors.

Automatic updates are intentionally disabled during the initial Preview.
Download the newer AppImage from the latest formal Release and replace the old
file manually. Automatic updates will only be enabled after a real
AppImage-to-AppImage upgrade has passed the cross-version release gate.

An AppImage does not install a desktop launcher or file associations by itself.
Desktop integration can be managed by the user's AppImage launcher or desktop
environment. If the host cannot mount AppImages, try:

```bash
./EdgeEver-*-linux-x64.AppImage --appimage-extract-and-run
```

When reporting a Linux-specific problem, include the distribution, desktop
environment, display protocol (Wayland or X11), architecture, and the EdgeEver
system diagnostics.
