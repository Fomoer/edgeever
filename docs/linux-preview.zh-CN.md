# Linux AppImage 预览版

EdgeEver 会在每个正式 GitHub Release 中提供 x86_64 AppImage 预览版。产物固定
在 Ubuntu 22.04 构建并验证，以确保 Rust sidecar 不超过 glibc 2.35 基线；预计
可兼容更新的 Ubuntu、Debian 12 和当前 Fedora，但预览阶段只提供尽力支持。

从同一个官方 Release 下载 `EdgeEver-<version>-linux-x64.AppImage` 和
`SHA256SUMS-linux.txt`，然后执行：

```bash
sha256sum --check SHA256SUMS-linux.txt
chmod +x EdgeEver-*-linux-x64.AppImage
./EdgeEver-*-linux-x64.AppImage
```

校验和可发现下载损坏或文件版本不匹配，但不代表代码签名身份。请勿从第三方镜像
下载此预览版。

预览版会检查正式 GitHub Release，在后台下载新版 AppImage，并在用户选择重启后
替换当前 AppImage。每个正式版本发布前都必须通过真实 AppImage 旧版本到新版本的
跨版本门禁。自动更新启用前发布的旧版本仍需最后手动替换一次。

自动替换要求用户对当前 AppImage 及其所在目录拥有写权限。保存在用户自己的下载或
应用目录中通常可以正常更新；如果由管理员放在 `/opt` 等系统级只读位置，则仍需
管理员手动替换或调整权限。

AppImage 本身不会安装桌面启动器或文件关联，可由用户使用的 AppImage 启动器或
桌面环境管理集成。如果系统无法挂载 AppImage，可以尝试：

```bash
./EdgeEver-*-linux-x64.AppImage --appimage-extract-and-run
```

反馈 Linux 专属问题时，请附上发行版、桌面环境、显示协议（Wayland 或 X11）、
系统架构和 EdgeEver 系统诊断信息。
