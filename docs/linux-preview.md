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

The Preview checks formal GitHub Releases for updates, downloads a newer
AppImage in the background, and replaces the current AppImage after you choose
to restart. Releases must pass a real AppImage-to-AppImage cross-version gate
before publication. Versions released before automatic updates were enabled
still require one final manual replacement.

Automatic replacement requires write access to both the current AppImage and
its containing directory. An AppImage kept in a user-owned Downloads or
Applications directory normally satisfies this requirement. A system-wide copy
owned by an administrator, such as one under `/opt`, must be updated manually
or made writable by the administrator.

An AppImage does not install a desktop launcher or file associations by itself.
Desktop integration can be managed by the user's AppImage launcher or desktop
environment. If the host cannot mount AppImages, try:

```bash
./EdgeEver-*-linux-x64.AppImage --appimage-extract-and-run
```

When reporting a Linux-specific problem, include the distribution, desktop
environment, display protocol (Wayland or X11), architecture, and the EdgeEver
system diagnostics.
