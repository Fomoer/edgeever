// Import these checks from ego-browser nodejs and pass a Page on the isolated demo instance.
import assert from 'node:assert/strict';

const openManagement = async (page) => {
  await page.goto('http://127.0.0.1:8788/');
  await page.waitForSelector('button[aria-label="管理分享"]');
  await page.click('button[aria-label="管理分享"]');
  await page.waitForSelector('button[aria-label="访问密码"]');
};

export const checkPasswordMutationFailure = async (page) => {
  await openManagement(page);
  const before = await page.evaluate(() => ({
    checked: document.querySelector('button[aria-label="访问密码"]').getAttribute('aria-checked'),
    password: document.querySelector('input[aria-label="访问密码"]')?.value,
  }));
  assert.equal(before.checked, 'true', 'Use an existing protected share in the isolated demo');
  await page.evaluate(() => {
    const state = window.__shareReview = {originalFetch: window.fetch, requests: [], rejections: []};
    state.onRejection = (event) => state.rejections.push(String(event.reason));
    window.addEventListener('unhandledrejection', state.onRejection);
    window.fetch = async function(input, init) {
      const url = String(typeof input === 'string' ? input : input.url);
      if (init?.method === 'PATCH' && /\/memos\/[^/]+\/share$/.test(url)) {
        state.requests.push(JSON.parse(init.body));
        return new Response(JSON.stringify({error:{code:'test_failure',message:'Injected failure'}}),
          {status:503,headers:{'content-type':'application/json'}});
      }
      return state.originalFetch.apply(this, arguments);
    };
  });
  let result;
  try {
    await page.click('button[aria-label="重新生成"]');
    await page.waitForSelector('[role="alert"]');
    await page.waitForFunction(() => !document.querySelector('button[aria-label="访问密码"]').disabled);
    await page.click('button[aria-label="访问密码"]');
    await page.waitForFunction(() => window.__shareReview.requests.length === 2 && !document.querySelector('button[aria-label="访问密码"]').disabled);
    await page.click('text="自定义密码"');
    await page.fill('input[aria-label="自定义分享密码"]', 'retain-draft-714');
    await page.click('text="保存密码"');
    await page.waitForFunction(() => window.__shareReview.requests.length === 3 && !document.querySelector('button[aria-label="访问密码"]').disabled);
    // Let the browser dispatch any unhandled-rejection event queued after the React update.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    result = await page.evaluate(() => ({
      rejections: window.__shareReview.rejections,
      requests: window.__shareReview.requests,
      alert: document.querySelector('[role="alert"]')?.textContent,
      checked: document.querySelector('button[aria-label="访问密码"]').getAttribute('aria-checked'),
      password: document.querySelector('input[aria-label="访问密码"]')?.value,
      draft: document.querySelector('input[aria-label="自定义分享密码"]')?.value,
    }));
  } finally {
    await page.evaluate(() => {
      window.fetch = window.__shareReview.originalFetch;
      window.removeEventListener('unhandledrejection', window.__shareReview.onRejection);
      delete window.__shareReview;
    });
  }
  assert.deepEqual(result.rejections, [], 'Generated-password failures must not leak rejected promises');
  assert.equal(result.requests.length, 3);
  assert.equal(result.checked, before.checked);
  assert.equal(result.password, before.password);
  assert.equal(result.draft, 'retain-draft-714');
  assert.ok(result.alert?.includes('分享状态更新失败'));
  return result;
};

export const checkPendingCustomSave = async (page) => {
  await openManagement(page);
  await page.click('text="自定义密码"');
  await page.fill('input[aria-label="自定义分享密码"]', '  review-password-714  ');
  await page.evaluate(() => {
    const state = window.__shareReview = { originalFetch: window.fetch, pending: false };
    window.fetch = async function(input, init) {
      const url = String(typeof input === 'string' ? input : input.url);
      if (init?.method === 'PATCH' && /\/memos\/[^/]+\/share$/.test(url)) {
        state.pending = true;
        await new Promise(resolve => { state.release = resolve; });
      }
      return state.originalFetch.apply(this, arguments);
    };
  });
  let inputDisabled;
  try {
    await page.click('text="保存密码"');
    await page.waitForFunction(() => window.__shareReview.pending && document.querySelector('button[aria-label="访问密码"]').disabled);
    inputDisabled = await page.evaluate(() => document.querySelector('input[aria-label="自定义分享密码"]').disabled);
  } finally {
    await page.evaluate(() => {
      const state = window.__shareReview;
      state.release?.(); window.fetch = state.originalFetch; delete window.__shareReview;
    });
  }
  await page.waitForFunction(() => !document.querySelector('input[aria-label="自定义分享密码"]'));
  const password = await page.evaluate(() => document.querySelector('input[aria-label="访问密码"]').value);
  assert.equal(inputDisabled, true, 'Pending saves must lock the custom input to avoid losing later edits');
  assert.equal(password, 'review-password-714');
  return { inputDisabled, savedPassword: password };
};
