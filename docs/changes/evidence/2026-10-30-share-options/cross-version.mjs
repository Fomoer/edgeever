// Run from the repository root: bun docs/changes/evidence/2026-10-30-share-options/cross-version.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import * as current from '../../../../apps/api/src/share-routes.ts';
import { renderPublicMemoSharePage } from '../../../../apps/api/src/share-page.ts';
const baseline = 'e052ac3b54bdcba4b2c452e6b06c091b1e2c70f4';
const oldRoute = resolve(`apps/api/src/.714-baseline-${process.pid}.ts`);
const oldSchema = resolve(`packages/shared/src/.714-baseline-${process.pid}.ts`);
const sql = new Database(':memory:');
class Statement {
  constructor(query, args = []) { this.query = query; this.args = args; }
  bind(...args) { return new Statement(this.query, args); }
  async first() { return sql.prepare(this.query).get(...this.args); }
  async all() { return { results: sql.prepare(this.query).all(...this.args), success: true }; }
  async run() { sql.prepare(this.query).run(...this.args); return { success: true }; }
}
const db = { prepare: (query) => new Statement(query), batch: async (statements) => {
  return sql.transaction(() => statements.map(s => sql.prepare(s.query).run(...s.args)))();
} };
const env = { EDGE_EVER_CREDENTIALS_ENCRYPTION_KEY: 'isolated-714-test-key', storage: { db, resources: {
  get: async () => ({body: new Blob(['attachment-714']).stream(), size: 14, writeHttpMetadata() {}}),
} } };
const appFor = (routes) => {
  const app = new Hono();
  app.use('/api/v1/*', async (c, next) => {
    c.set('auth', { kind: 'user', actorType: 'user', actorId: null, scopes: [], workspaceId: 'ws_714', role: 'member' });
    await next();
  });
  routes.registerMemoShareRoutes(app); routes.registerPublicShareRoutes(app); return app;
};
const request = (app, path, method = 'GET', body, cookie) => app.request(path, {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? {Cookie: cookie} : {}) },
  ...(body ? {body: JSON.stringify(body)} : {}),
}, env);
const sharePath = '/api/v1/memos/memo_714/share';
const results = { baseline, checks: [] };
const check = (name) => results.checks.push(name);
try {
  writeFileSync(oldSchema, execFileSync('git', ['show', `${baseline}:packages/shared/src/schemas.ts`]));
  const oldSource = execFileSync('git', ['show', `${baseline}:apps/api/src/share-routes.ts`], {encoding:'utf8'});
  writeFileSync(oldRoute, oldSource.replace('MemoShareUpdateSchema, ', '') + `\nimport { MemoShareUpdateSchema } from ${JSON.stringify(oldSchema)};\n`);
  const old = appFor(await import(pathToFileURL(oldRoute).href));
  for (const file of globSync('migrations/*.sql').sort()) {
    if (file < 'migrations/0082_') sql.exec(readFileSync(file,'utf8'));
  }
  sql.exec(`INSERT INTO workspaces(id,name,is_personal) VALUES('ws_714','Isolated acceptance',1);
    INSERT INTO notebooks(id,workspace_id,name) VALUES('nb_714','ws_714','Inbox');
    INSERT INTO memos(id,workspace_id,notebook_id,title) VALUES('memo_714','ws_714','nb_714','Migration acceptance');
    INSERT INTO memo_contents(memo_id,content_json,content_markdown,content_hash) VALUES('memo_714','{"type":"doc","content":[]}','Unchanged body','test');
    INSERT INTO resources(id,memo_id,object_key,kind,mime_type,filename,byte_size) VALUES('res_714','memo_714','714','attachment','text/plain','test.txt',14);`);
  assert.equal((await request(old,sharePath,'POST',{})).status,201);
  const protectedShare = (await (await request(old,sharePath,'PATCH',{passwordProtected:true})).json()).share;
  assert.equal(protectedShare.password.length,8);
  const base = `/api/public/shares/${protectedShare.token}`;
  const unlock = async (app,password) => request(app,`${base}/unlock`,'POST',{password});
  const oldUnlocked = await unlock(old,protectedShare.password);
  assert.equal(oldUnlocked.status,200);
  const cookie = oldUnlocked.headers.get('set-cookie').split(';')[0];
  check('Baseline routes and schema create and unlock a generated-password share before migration 0082');
  const before = sql.prepare('SELECT * FROM memo_shares').get();
  sql.exec(readFileSync('migrations/0082_memo_share_options.sql','utf8'));
  sql.exec(readFileSync('migrations/0083_memo_share_presentation.sql','utf8'));
  const after = sql.prepare('SELECT * FROM memo_shares').get();
  assert.deepEqual(after,{...before,show_details:1,show_updated_at:1,show_branding:1});
  const next = appFor(current);
  assert.equal((await request(next,base,'GET',null,cookie)).status,200);
  const migratedShare=(await (await request(next,sharePath)).json()).share;
  assert.equal(migratedShare.showUpdatedAt,true);
  assert.equal(migratedShare.showBranding,true);
  check('Migrations 0082/0083 preserve every old row value; new routes accept the pre-upgrade unlock and enable both presentation settings by default');
  const hidden = await request(next,sharePath,'PATCH',{showUpdatedAt:false,showBranding:true});
  assert.equal((await hidden.json()).share.password,protectedShare.password);
  assert.equal((await request(next,base,'GET',null,cookie)).status,200);
  check('Changing only presentation preserves password and existing unlock');
  for (const password of ['', '   ', 'abc', 'x'.repeat(65)]) {
    const beforeInvalid = sql.prepare('SELECT * FROM memo_shares').get();
    assert.equal((await request(next,sharePath,'PATCH',{password,showBranding:false})).status,400);
    assert.deepEqual(sql.prepare('SELECT * FROM memo_shares').get(),beforeInvalid);
  }
  for (const password of ['abcd','x'.repeat(64),'  分享验收714  ']) {
    const response=await request(next,sharePath,'PATCH',{passwordProtected:true,password});
    assert.equal(response.status,200);
    assert.equal((await response.json()).share.password,password.trim());
    assert.equal((await unlock(next,password.trim())).status,200);
  }
  check('Invalid lengths leave the entire share unchanged; lengths 4/64 and trimmed Chinese passwords unlock');
  assert.equal((await unlock(next,protectedShare.password)).status,403);
  assert.equal((await request(next,base,'GET',null,cookie)).status,403);
  assert.equal((await request(next,`${base}/resources/res_714/blob`,'GET',null,cookie)).status,403);
  const fresh = (await unlock(next,'分享验收714')).headers.get('set-cookie').split(';')[0];
  assert.equal((await request(next,`${base}/resources/res_714/blob`,'GET',null,fresh)).status,200);
  check('Custom password replacement invalidates the old password and cookie for both body and attachment; new unlock works');
  const lockedMd=await renderPublicMemoSharePage(new Request(`http://localhost/share/${protectedShare.token}.md`),db,async()=>new Response('<div id="root"></div>'));
  assert.equal(lockedMd.status,403);
  const stored=sql.prepare('SELECT password_hash,password_encrypted FROM memo_shares').get();
  assert(!stored.password_hash.includes('分享验收714')); assert(!stored.password_encrypted.includes('分享验收714'));
  check('Password-protected raw Markdown remains blocked and password storage is not plaintext');
  // Old clients and an application rollback continue using their original contract.
  const oldRead=(await (await request(old,sharePath)).json()).share;
  assert.equal(oldRead.password,'分享验收714');
  assert.equal((await request(old,base,'GET',null,fresh)).status,200);
  const regenerated=(await (await request(old,sharePath,'PATCH',{passwordProtected:true})).json()).share;
  assert.equal(regenerated.password.length,8);
  assert.deepEqual(sql.prepare('SELECT show_updated_at,show_branding FROM memo_shares').get(),{show_updated_at:0,show_branding:1});
  assert.equal((await request(next,sharePath,'PATCH',{passwordProtected:false})).status,200);
  assert.equal((await request(next,base)).status,200);
  const markdown=await renderPublicMemoSharePage(new Request(`http://localhost/share/${protectedShare.token}.md`),db,async()=>new Response('<div id="root"></div>'));
  assert.equal(markdown.status,200); assert.equal(await markdown.text(),'# Migration acceptance\n\nUnchanged body');
  check('Baseline application reads new custom passwords and regenerates after migration; old-style disable restores public Markdown without changing presentation');
  results.status='passed';
  writeFileSync(new URL('./cross-version.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
} finally {
  sql.close();
  for (const path of [oldRoute,oldSchema]) { try { unlinkSync(path); } catch {} }
}
