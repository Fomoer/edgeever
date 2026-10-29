import { expect, test } from 'bun:test';
import { createDocument, createWindow } from '@mixmark-io/domino';
import { runInNewContext } from 'node:vm';
import { bundleTestScripts } from './bundle-test-scripts.mjs';
import { readMetaSocial, metaPostCard } from './src/social-clip.ts';
import { platformTarget } from './src/platform-clip.ts';

const url = 'https://www.instagram.com/p/SelectedPost/';
const source = 'https://www.instagram.com/';
const media = { code: 'SelectedPost', user: { username: 'author' }, caption: { text: 'A full caption beyond the preview' }, taken_at: 1700000000,
  media_type: 8, carousel_media_count: 3, carousel_media: [1,2,3].map(i => ({ media_type: 1, image_versions2: { candidates: [{url:`https://images.example.test/${i}.jpg`,width:1000,height:1000}] } })) };
const json = value => `<script type="application/json">${JSON.stringify(value)}</script>`;
const feed = `<article><a href="/author/">author</a><a href="/p/SelectedPost/"><time datetime="2026-10-08T08:40:23Z">2 weeks</time></a><img src="https://images.example.test/1.jpg"><p>A full caption... <button>more</button></p><button>Like</button><button>Share</button></article>`;
const [bundle] = bundleTestScripts(['capture-platform']);

async function capture({ html=feed, data=media, status=200, change, contentType='text/html', responseUrl=url, sourceUrl=source }={}) {
  const w=createWindow(html,sourceUrl), location={href:sourceUrl};
  Object.getPrototypeOf(w.document.querySelectorAll('*'))[Symbol.iterator] ??= Array.prototype[Symbol.iterator];
  const calls=[];
  let done;
  const result = new Promise(resolve=>{done=resolve;});
  runInNewContext(bundle, { window:w,document:w.document,location,URL,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,
    DOMParser:class {parseFromString(html){return createDocument(html);}},
    __edgeeverPlatformClipPayload:{requestId:'instagram',url,sourceUrl},
    fetch:async (request,init)=>{calls.push({url:request,init});change?.(w.document,location);return {ok:status===200,url:responseUrl,headers:new Headers({'content-type':contentType}),text:async()=>json(data)};},
    chrome:{i18n:{getMessage:k=>k},runtime:{sendMessage:async message=>done(message.result)}},
  });
  return {result:await result,calls};
}

test('Instagram dynamic feed fetches only the selected same-origin detail and keeps all carousel images',async()=>{
  const {result,calls}=await capture();
  expect(result.ok).toBe(true);expect(result.clip.url).toBe(url);expect(result.clip.author).toBe('author');
  expect(result.clip.markdown).toContain(media.caption.text);expect(result.clip.markdown.match(/!\[/g)).toHaveLength(3);
  expect(calls).toHaveLength(1);expect(calls[0].url).toBe(url);
  expect(calls[0].init.credentials).toBe('same-origin');expect(calls[0].init.redirect).toBe('error');
});

for (const failure of ['wrong-post','login','redirect','http','not-html','incomplete','navigation','recycled','hidden','no-card']) test(`Instagram detail fallback rejects ${failure}`,async()=>{
  const {result,calls}=await capture({
    data:failure==='wrong-post'?{...media,code:'OtherPost'}:failure==='login'?{login:true}:failure==='incomplete'?{...media,carousel_media:media.carousel_media.slice(0,1)}:media,
    status:failure==='http'?403:200,contentType:failure==='not-html'?'application/json':'text/html',
    responseUrl:failure==='redirect'?'https://www.instagram.com/accounts/login/':url,
    html:failure==='hidden'?feed.replace('<article>','<article hidden>'):failure==='no-card'?'<main>Log in</main>':feed,
    change:(doc,location)=>{if(failure==='navigation')location.href='https://www.instagram.com/p/OtherPost/';if(failure==='recycled')doc.querySelector('a[href="/p/SelectedPost/"]').setAttribute('href','/p/OtherPost/');},
  });
  expect(result.ok).toBe(false);expect(result.clip).toBeUndefined();
  expect(calls).toHaveLength(['hidden','no-card'].includes(failure)?0:1);
});

test('Instagram fallback preserves the current host, including the non-www origin',async()=>{
  const {result,calls}=await capture({sourceUrl:'https://instagram.com/',responseUrl:'https://instagram.com/p/SelectedPost/'});
  expect(result.ok).toBe(true);expect(calls[0].url).toBe('https://instagram.com/p/SelectedPost/');
});

test('Instagram detail card includes media and caption rather than the likes footer or comments',()=>{
  const doc=createDocument(`<main><div id="post"><img src="https://images.example.test/1.jpg"><div><a href="/author/">author</a><p>${media.caption.text}</p></div><div id="footer"><a href="/liker/"><img src="https://images.example.test/avatar.jpg">liker</a><button>Like</button><button>Share</button><button>Save</button><a href="/author/p/SelectedPost/"><time datetime="2026-10-08T08:40:23Z">October 8</time></a></div></div><div>COMMENT SENTINEL</div></main>${json(media)}`);
  expect(metaPostCard(doc.querySelector('time').parentElement,'instagram',url).id).toBe('post');
  const result=readMetaSocial(doc,platformTarget(url));
  expect(result.ok).toBe(true);expect(result.clip.markdown).toContain(media.caption.text);
  expect(result.clip.markdown).not.toContain('COMMENT SENTINEL');
});
