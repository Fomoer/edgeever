# 只剪藏网页的一部分

[English](browser-clipper-regions.md)

打开 EdgeEver 插件，点击“选择区域”。移动鼠标预览页面中的内容边界，点击要保留的区域；这次点击用于选择，不会打开网页里的链接。

- 用“扩大／缩小”或左／右方向键调整父子区域。
- 用上／下方向键切换到前一个／后一个可见的同级区域。
- “重新选择”回到鼠标选择状态；“取消”或 Esc 退出，不保存。
- 选好后点击“保存到 EdgeEver”或按 Enter，在插件配置的笔记本中创建笔记。长区域可以先滚动检查，再保存。

笔记保留网页标题、来源链接、采集时间及所选内容的 Markdown，包括支持的表格、代码、链接和图片。图片沿用既有本地化流程，部分图片失败时使用原提示。隐藏内容和表单控件不进入笔记，原网页不被修改。区域为空或已移除时显示错误，不会改为保存整页。

保存开始后禁用重复确认和取消，直到请求完成。失败时保留选区并显示错误，不自动重试。

选择器用于可访问的 HTTP(S) 页面；浏览器内部页面和扩展商店的限制仍然适用。选择的是 DOM 内容，不是截图矩形或 iframe 内部。原“剪藏当前网页”和选中文字操作仍可使用。

## 参考与验证

选择交互及包裹层／历史回退算法参考并改编自 [MaoXian Web Clipper](https://github.com/mika-cn/maoxian-web-clipper/blob/e69fbf9c04bad7051d3810e1cef4d82138f812df/src/js/content/ui.js)，MIT 署名保留在[第三方声明](../apps/extension/THIRD_PARTY_NOTICES.md)中，并随构建后的插件包一起提供。

验证证据和未完成的平台检查见[变更清单](changes/2026-10-29-region-clip.zh-CN.md)。Chromium 使用 `bun run build:extension` 构建，再以“加载已解压的扩展程序”加载 `apps/extension/dist`；Firefox 使用 `bun run build:extension:firefox`。构建不会更新已安装插件，也不会发布到商店。
