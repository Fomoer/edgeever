import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Script, createContext, runInContext } from "node:vm";
import { createWindow, createDocument } from "@mixmark-io/domino";
import { bundleTestScripts } from "./bundle-test-scripts.mjs";
import { fileURLToPath } from "node:url";
import { markdownToDoc } from "../../packages/shared/src/content.ts";
import { pageImageRefs, replacePageImageUrls } from "./src/page-images.ts";

test('whole-page and selection captures share table conversion and preserve code blank lines',async()=>{
  const [source]=bundleTestScripts(['capture']);
  const code='const first = 1;\n\n\nconst second = 2;';
  const content='<h2 data-selectable-paragraph>Section</h2><blockquote><p>Quoted update</p></blockquote><table><tr><th>A</th><th>B</th></tr><tr><td>cell<br>line</td><td><a href="https://example.test/source">source</a></td></tr></table><pre><code class="language-js">'+code+'</code></pre>';
  for(const name of ['medium-article','substack-article','generic']) for(const selection of [false,true]) {
    const url=name==='medium-article'?'https://medium.com/@scott.batson_76410/what-should-programmers-do-while-the-ai-writes-code-a2ce2e6de88e':name==='substack-article'?'https://www.oneusefulthing.org/p/the-dot-and-the-swarm':'https://example.test/article';
    const html=name==='generic'?'<title>Article</title><article>'+content+'</article>':await readFile(new URL(`./fixtures/platforms/${name}.html`,import.meta.url),'utf8');
    const w=createWindow(html,url);let page;
    // Readability uses modern iterable live collections; Domino's mock omits
    // this browser API even though real Chromium/Firefox provide it.
    Object.getPrototypeOf(w.document.getElementsByTagName('*'))[Symbol.iterator] ??= Array.prototype[Symbol.iterator];
    Object.defineProperty(Object.getPrototypeOf(w.document),'baseURI',{configurable:true,get(){return this.URL;}});
    const holder=createDocument(content).body;
    if(name!=='generic') {const container=w.document.querySelector(name==='medium-article'?'article':'.body.markup');while(holder.firstChild)container.appendChild(w.document.importNode(holder.removeChild(holder.firstChild),true));}
    w.getSelection=()=>selection?{rangeCount:1,toString:()=> 'Selected content',getRangeAt:()=>({cloneContents:()=>{const f=w.document.createDocumentFragment(),temp=createDocument(content).body;while(temp.firstChild)f.appendChild(w.document.importNode(temp.removeChild(temp.firstChild),true));return f;}})}:null;
    const context=createContext({...browserTimers,window:w,document:w.document,location:w.location,URL,chrome:{i18n:{getMessage:key=>key},runtime:{sendMessage:message=>{page=message.page;}}},...(selection?{__edgeeverPageClipPayload:{mode:'selection'}}:{})});
    runInContext(source,context);
    const parsed=markdownToDoc(page.markdown),blocks=[];const walk=node=>{blocks.push(node);(node.content || []).forEach(walk);};walk(parsed);
    expect(blocks.find(node=>node.type==='codeBlock')?.content.map(node=>node.text).join(''),`${name}, selection=${selection}: ${page.markdown}`).toBe(code);
    const table=blocks.find(node=>node.type==='table');expect(table?.content).toHaveLength(2);expect(table.content[1].content).toHaveLength(2);
    expect(blocks.some(node=>node.type==='hardBreak')).toBe(true);
    expect(blocks.some(node=>node.marks?.some(mark=>mark.type==='link' && mark.attrs.href==='https://example.test/source'))).toBe(true);
    expect(page.kind).toBe(selection?'selection':'page');
  }
});

const execFileAsync = promisify(execFile);
const browserTimers={setTimeout,clearTimeout,setInterval,clearInterval};

test('Medium page capture retains story blocks and both images without article controls',async()=>{
  const html=await readFile(new URL('./fixtures/platforms/medium-article.html',import.meta.url),'utf8');
  const url='https://medium.com/@scott.batson_76410/what-should-programmers-do-while-the-ai-writes-code-a2ce2e6de88e';
  const [source]=bundleTestScripts(["capture"]);
  const capture=(body,selection=false,sourceUrl=url)=>{
    const w=createWindow(body,sourceUrl);let page;
    w.DOMParser=class { parseFromString(value){return createDocument(value);} };
    w.getSelection=()=>selection?{rangeCount:1,toString:()=> 'Selected paragraph',getRangeAt:()=>({cloneContents:()=>{const f=w.document.createDocumentFragment(),p=w.document.createElement('p');p.textContent='Selected paragraph';f.appendChild(p);return f;}})}:null;
    const context=createContext({...browserTimers,window:w,document:w.document,location:w.location,URL,chrome:{i18n:{getMessage:k=>k},runtime:{sendMessage:m=>{page=m.page;}}}});
    runInContext(source,context);return page;
  };
  const page=capture(html);expect(page.title).toBe('What Should Programmers Do While the AI Writes Code?');
  expect(page.markdown).toContain('Most every programmer');expect(page.markdown).toContain('10 times as meaningful');
  expect(page.markdown).toContain('## Slow work');expect(page.markdown).toContain('## Writing');
  expect(page.markdown).toContain('Photo by me');expect(page.markdown.match(/!\[/g)).toHaveLength(2);
  for(const noise of ['Top highlight','Member-only story','Follow','8.3K','Press enter or click'])expect(page.markdown).not.toContain(noise);
  expect(capture(html,true).markdown).toBe('Selected paragraph');
  const custom=capture(html,false,'https://scottbatson.dev/what-should-programmers-do-while-the-ai-writes-code-a2ce2e6de88e');
  expect(custom.markdown).toBe(page.markdown);expect(custom.title).toBe(page.title);
  expect(custom.platform).toBe('medium');expect(custom.author).toBe('Scott Batson');expect(custom.publishedAt).toEqual({value:'2026-08-31T18:48:46Z',precision:'datetime'});
  expect(capture(html,true).platform).toBeUndefined();
  const noTitle=createDocument(html);noTitle.querySelector('h1[data-selectable-paragraph]').remove();noTitle.querySelector('article').style.display='none';
  for(const pageUrl of [url,'https://scottbatson.dev/what-should-programmers-do-while-the-ai-writes-code-a2ce2e6de88e']) {
    expect(capture(noTitle.documentElement.outerHTML,false,pageUrl)).toEqual({error:'unreadable'});
    expect(capture(noTitle.documentElement.outerHTML,true,pageUrl).markdown).toBe('Selected paragraph');
  }
  for(const attribute of ['hidden','aria-hidden="true"']) {
    const hidden=html.replace('<article',`<article ${attribute}`);
    expect(capture(hidden)).toEqual({error:'unreadable'});
    expect(capture(hidden,true).markdown).toBe('Selected paragraph');
  }
  const unsafe=html.replace('</article>','<p data-selectable-paragraph><a href="javascript:alert(1)">Unsafe</a></p></article>');
  expect(capture(unsafe).markdown).not.toContain('javascript:');
});

test('Substack article capture retains sections and images on custom domains without subscription UI',async()=>{
  const html=await readFile(new URL('./fixtures/platforms/substack-article.html',import.meta.url),'utf8');
  const [source]=bundleTestScripts(["capture"]);
  const capture=(body,url,selection=false)=>{
    const w=createWindow(body,url);let page;
    w.DOMParser=class { parseFromString(value){return createDocument(value);} };
    w.getSelection=()=>selection?{rangeCount:1,toString:()=> 'Selected paragraph',getRangeAt:()=>({cloneContents:()=>{const f=w.document.createDocumentFragment(),p=w.document.createElement('p');p.textContent='Selected paragraph';f.appendChild(p);return f;}})}:null;
    runInContext(source,createContext({...browserTimers,window:w,document:w.document,location:w.location,URL,chrome:{i18n:{getMessage:k=>k},runtime:{sendMessage:m=>{page=m.page;}}}}));return page;
  };
  const url='https://www.oneusefulthing.org/p/the-dot-and-the-swarm';
  const page=capture(html,url);
  expect(page.title).toBe('The Dot and the Swarm');
  expect(page.platform).toBe('substack');expect(page.author).toBe('Ethan Mollick');expect(page.publishedAt).toEqual({value:'2026-10-01T18:54:12+08:00',precision:'datetime'});
  const missing=createDocument(html);missing.querySelector('script').remove();expect(capture(missing.documentElement.outerHTML,url).author).toBeUndefined();
  const unrelated=createDocument(html),schema=unrelated.querySelector('script'),data=JSON.parse(schema.textContent);data.url='https://www.oneusefulthing.org/p/other';schema.textContent=JSON.stringify(data);expect(capture(unrelated.documentElement.outerHTML,url).author).toBeUndefined();
  for(const content of ['Benefitting from the Bitter Lesson','Nope.','# Dots and Muse','# Swarms','# A Not-Entirely-Bitter Lesson','very cool pre-order bonus'])expect(page.markdown).toContain(content);
  expect(page.markdown.match(/!\[/g)).toHaveLength(3);
  const uploaded=pageImageRefs(page.markdown,url).map((image,index)=>({...image,resourceId:`substack-${index}`}));
  const stored=markdownToDoc(replacePageImageUrls(page.markdown,uploaded)),nodes=[];
  const walk=node=>{nodes.push(node);(node.content || []).forEach(walk);};walk(stored);
  expect(nodes.filter(node=>node.type==='image').map(node=>node.attrs.src)).toEqual(uploaded.map(image=>`/api/v1/resources/${image.resourceId}/blob`));
  const text=nodes.filter(node=>node.type==='text').map(node=>node.text).join('');
  expect(text).not.toContain('substackcdn.com/image/');
  expect(nodes.some(node=>node.type==='text' && node.text==='[')).toBe(false);
  for(const noise of ['Subscribe','Share','Comments and recommendations','One Useful Thing'])expect(page.markdown).not.toContain(noise);
  expect(capture(html,url,true).markdown).toBe('Selected paragraph');
  expect(capture(html,'https://oneusefulthing.substack.com/p/the-dot-and-the-swarm').markdown).toBe(page.markdown);
  const preview=html.replace('Nope.','Visible paid preview.');
  expect(capture(preview,url).markdown).toContain('Visible paid preview.');
  for(const attribute of ['hidden','aria-hidden="true"']) {
    const d=createDocument(html);d.querySelector('.body.markup').setAttribute(attribute.split('=')[0],attribute==='hidden'?'':'true');
    expect(capture(d.documentElement.outerHTML,url)).toEqual({error:'unreadable'});
    expect(capture(d.documentElement.outerHTML,url,true).markdown).toBe('Selected paragraph');
  }
});

test("the injected page capture is a standalone classic script", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "edgeever-capture-"));
  try {
    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
      "build",
      "--config",
      fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
      "--outDir",
      outDir,
      "--logLevel",
      "silent",
    ]);

    const capture = await readFile(join(outDir, "assets/capture.js"), "utf8");
    expect(() => new Script(capture)).not.toThrow();
    expect(capture).toContain("capturedPage");
    const region = await readFile(join(outDir, "assets/region-clip.js"), "utf8");
    expect(() => new Script(region)).not.toThrow();
    expect(region).toContain("saveRegionClip");
    expect(await readFile(join(outDir, "THIRD_PARTY_NOTICES.txt"), "utf8")).toContain("Copyright (c) 2018 Mika");
    const platform = await readFile(join(outDir, "assets/capture-platform.js"), "utf8");
    expect(() => new Script(platform)).not.toThrow();
    expect(platform).toContain("pagePlatformRead");
    const feedback = await readFile(join(outDir, "assets/clip-feedback.js"), "utf8");
    expect(() => new Script(feedback)).not.toThrow();
    expect(feedback).toContain("data-sonner-toaster");
    // UI dependencies belong only to the feedback bundle, never image reading.
    const image = await readFile(join(outDir, "assets/capture-image.js"), "utf8");
    expect(() => new Script(image)).not.toThrow();
    expect(image).not.toContain("data-sonner-toaster");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
