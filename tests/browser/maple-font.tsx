import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { FontLabel } from "../../apps/web/src/components/FontLabel";
import { loadCatalogFont, createRemoteFontResourceLoader } from "../../packages/shared/src/font-loader";
import { FONT_CATALOG, parseRemoteFontCss, remoteFontCssUrl } from "../../packages/shared/src/font-catalog";
import { fontSubsetContains } from "../../packages/shared/src/font-loader";
import type { FontLoadStatus } from "../../apps/web/src/lib/font-load-state";
import { applyEditorBodyFontPreference } from "../../apps/web/src/lib/editor-body-font";
import { editorFontLoadState } from "../../apps/web/src/lib/editor-catalog-fonts";
import { MarkdownSourceEditor, type MarkdownSourceEditorRef } from "../../apps/web/src/components/editor/MarkdownSourceEditor";
import "../../apps/web/src/styles/globals.css";
import "../../apps/web/src/styles/editor-body-fonts.css";

await i18next.init({ lng: "en", resources: { en: { translation: { fontLoad: { loading: "Loading", error: "Unavailable" } } } } });
const font = "maple-mono-cn";
const sample = "记录此刻的灵感 中文 English 0123456789 => !=";
const requests: string[] = [];
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (...args: Parameters<XMLHttpRequest["open"]>) {
  if (String(args[1]).includes("@chinese-fonts/maple-mono-cn@")) requests.push(String(args[1]));
  return originalOpen.apply(this, args);
};

function Verification() {
  const source = useRef<MarkdownSourceEditorRef>(null);
  const [markdown, setMarkdown] = useState("iii WWW 中文 => !=\n源码独有字：龘\n| 项目 | Value |\n| ---- | ----- |\n| 字体 | Maple |\n");
  const [selected, setSelected] = useState(false);
  const [status, setStatus] = useState<FontLoadStatus>("idle");
  const contentStatus = useSyncExternalStore(editorFontLoadState.subscribe, editorFontLoadState.getSnapshot);
  const [result, setResult] = useState("正在检查未选中选项…");
  useEffect(() => {
    const timer = setTimeout(() => setResult(requests.length === 0
      ? "PASS：列表条目可见时，Maple 字体请求为 0。"
      : `FAIL：未选择就产生了 ${requests.length} 个请求。`), 1200);
    return () => clearTimeout(timer);
  }, []);

  const verifyExportAndCache = async () => {
    try {
      const css = await loadCatalogFont(font, sample, { embed: true });
      if (!css.includes("Copyright 2022 The Maple Mono Project Authors") || !css.includes("data:font/woff2;base64,")) throw new Error("Missing export font or license");
      await document.fonts.ready;
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `20px "${FONT_CATALOG[font].family}"`;
      const ratio = ctx.measureText("中").width / ctx.measureText("M").width;
      if (Math.abs(ratio - 2) > 0.01) throw new Error(`CJK/Latin width ratio ${ratio}`);
      const before = requests.length;
      const loader = createRemoteFontResourceLoader();
      const manifest = remoteFontCssUrl(font);
      const blocks = parseRemoteFontCss(new TextDecoder().decode(await loader(manifest, true)), font);
      const points = new Set(Array.from(sample, char => char.codePointAt(0)!));
      const used = blocks.filter(block => fontSubsetContains(block.range, points));
      await Promise.all(used.map(block => loader(block.asset)));
      if (requests.length !== before) throw new Error("Fresh loader did not reuse persistent cache");
      setResult(`PASS：选中后加载成功；中英文宽度 2:1；导出保留字体与授权；新加载器读取缓存时请求为 0。实际下载 ${used.length}/${blocks.length} 个分片。`);
    } catch (error) { setResult(`FAIL：${String(error)}`); }
  };

  const verifyCodeFonts = async () => {
    try {
      const expected = FONT_CATALOG[font].family;
      if (![...document.fonts].some(face => face.family === expected && face.status === "loaded" && fontSubsetContains(face.unicodeRange, new Set([0x9f98])))) throw new Error("Source-only character was not loaded");
      const codeNodes = document.querySelectorAll(".ProseMirror code, .ProseMirror pre, .ProseMirror .edgeever-code-source, .cm-scroller, .cm-content");
      if (codeNodes.length < 7 || [...codeNodes].some(node => !getComputedStyle(node).fontFamily.includes(expected))) throw new Error("A code surface did not follow Maple");
      const before = markdown;
      const x: number[] = [];
      for (const position of [0, 1, 2, 3, 8, 9, 10]) {
        source.current!.setSelection(position, position);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const coords = source.current!.getSelectionCoordinates();
        if (!coords) throw new Error("Missing source cursor coordinates");
        x.push(coords.left);
      }
      const latin = x[1] - x[0];
      if (latin <= 0 || Math.abs((x[2] - x[1]) - latin) > 1 || Math.abs((x[5] - x[4]) - latin * 2) > 1) throw new Error(`Cursor widths: ${x}`);
      source.current!.setSelection(0, 3);
      if (source.current!.sliceText(0, 3) !== "iii") throw new Error("Source selection changed text");
      applyEditorBodyFontPreference({ choice: "custom", customFamily: "Arial" });
      await new Promise(resolve => requestAnimationFrame(resolve));
      if ([...codeNodes].some(node => getComputedStyle(node).fontFamily.includes(expected))) throw new Error("Switching to proportional body did not restore code fallback");
      if (source.current!.sliceText(0, source.current!.getDocumentLength()) !== before) throw new Error("Font switch changed document contents");
      applyEditorBodyFontPreference({ choice: font, customFamily: "" });
      setResult("PASS：默认及主题代码块、行内代码、Mermaid 源码和真实 CodeMirror 均使用 Maple；光标位置与选区正确；切回比例字体恢复代码等宽回退，文档内容不变。");
    } catch (error) { setResult(`FAIL：${String(error)}`); }
  };

  return <>
    <p role="status">{result}</p>
    <p>列表选项：<FontLabel label="Maple Mono CN" fontId={font} enabled visibleOnly /></p>
    <button onClick={() => { applyEditorBodyFontPreference({ choice: font, customFamily: "" }); setSelected(true); }}>选择 Maple Mono CN</button>{" "}
    <button disabled={status !== "ready"} onClick={() => void verifyExportAndCache()}>验证导出与缓存</button>
    {" "}<button disabled={status !== "ready" || contentStatus !== "ready"} onClick={() => void verifyCodeFonts()}>验证代码字体与光标</button>
    {selected && <div>
      <p>选中状态：{status}</p>
      <FontLabel label={sample} fontId={font} enabled onStatusChange={setStatus} />
    </div>}
    {["default", "wechat-green"].map(theme => <section key={theme} className="edgeever-editor" data-editor-theme={theme}>
      <h2>{theme} · 富文本代码</h2>
      <div className="ProseMirror"><p>正文与行内代码 <code>{sample}</code></p><pre><code>{sample}</code></pre><pre className="edgeever-code-source">graph TD; A --&gt; B</pre></div>
    </section>)}
    <section className="edgeever-editor" style={{ height: 220 }}>
      <h2>Markdown 源码</h2>
      <MarkdownSourceEditor ref={source} memoId="maple-font-test" value={markdown} onChange={setMarkdown} themeName="github-light" ariaLabel="字体测试源码" />
    </section>
  </>;
}

createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18next}><Verification /></I18nextProvider>);
