// Run from the checkout root after the API and desktop backup workers are built.
// Uses and removes only isolated temporary databases, storage and processes.
import { Database } from 'bun:sqlite';
import { fork, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const repo=process.cwd();
const {fetchEdgeEverApp}=await import(`${repo}/apps/api/src/index.ts`);
const {createSelfHostedStorageAdapter}=await import(`${repo}/apps/api/src/self-hosted-storage-adapter.ts`);
const {createEdgeEverClient}=await import(`${repo}/packages/client/src/index.ts`);
const root=await mkdtemp(join(tmpdir(),'edgeever-wrangler-restore-'));const children=[];let source,db,api;const log=await open(join(root,'wrangler.log'),'w');
const freePort=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const launch=async(data)=>{
 const child=fork(join(repo,'apps/desktop/src/backup/tests/node-worker-runner.mjs'),[join(repo,'apps/desktop/build/backup-worker.mjs')],{execPath:spawnSync('node',['-p','process.execPath'],{encoding:'utf8'}).stdout.trim(),stdio:['ignore','ignore','pipe','ipc']});children.push(child);child.stderr.on('data',x=>process.stderr.write(x));
 const messages=[];let wake;child.on('message',x=>{messages.push(x);wake?.();});child.send(data);
 const next=async(type)=>{let timer;try{return await Promise.race([(async()=>{while(true){const error=messages.find(x=>x.type==='error');if(error)throw Object.assign(new Error(error.error.message),error.error);const index=messages.findIndex(x=>x.type===type);if(index!==-1)return messages.splice(index,1)[0];await new Promise(r=>wake=r);}})(),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(`Worker timed out waiting for ${type}`)),60000))]);}finally{clearTimeout(timer);}};
 return {child,messages,next};
};
try {
 db=new Database(join(root,'source.sqlite'));for(const file of(await readdir(join(repo,'migrations'))).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile(join(repo,'migrations',file),'utf8'));
 const env={storage:createSelfHostedStorageAdapter(db,join(root,'source-resources')),EDGE_EVER_ALLOW_UNAUTHENTICATED:'true',EDGE_EVER_RUNTIME:'self-hosted-bun'};
 source=Bun.serve({hostname:'127.0.0.1',port:0,fetch:req=>fetchEdgeEverApp(req,env,{waitUntil(){},passThroughOnException(){}})});
 const client=createEdgeEverClient({baseUrl:`http://127.0.0.1:${source.port}`});
 const {notebook}=await client.createNotebook({name:'Isolated proxy replay'});const {memo}=await client.createMemo({notebookId:notebook.id,contentMarkdown:'portable proxy fixture',tags:['proxy-fixture']});const resources=[];
 for(let i=0;i<3;i++){const bytes=new Uint8Array(1024*1024+i+1).fill(40+i);const {resource}=await client.uploadMemoResource(memo.id,new File([bytes],`payload-${i}.bin`,{type:'application/octet-stream'}));resources.push({resource,bytes});}
 const path=join(root,'fixture.zip');const exported=await launch({operation:'export',context:{baseUrl:`http://127.0.0.1:${source.port}`,accountId:null,token:'',locale:'en-US'},path,version:{edgeeverVersion:'2.2.0',buildId:'proxy-fixture'}});await exported.next('done');source.stop(true);source=undefined;
 await mkdir(join(root,'assets'));await writeFile(join(root,'assets/index.html'),'isolated fixture');
 const config={name:'edgeever-isolated-proxy-restore',main:join(repo,'.wrangler/edgeever-worker/index.js'),compatibility_date:'2026-06-26',no_bundle:true,find_additional_modules:true,base_dir:join(repo,'.wrangler/edgeever-worker'),rules:[{type:'ESModule',globs:['modules/*.js'],fallthrough:true}],assets:{directory:join(root,'assets'),binding:'ASSETS',not_found_handling:'single-page-application',run_worker_first:true},d1_databases:[{binding:'DB',database_name:'edgeever-isolated-restore',database_id:crypto.randomUUID(),migrations_dir:join(repo,'migrations')}],r2_buckets:[{binding:'RESOURCES',bucket_name:'edgeever-isolated-restore-resources'}],vars:{EDGE_EVER_ALLOW_UNAUTHENTICATED:'true'}};
 const configPath=join(root,'wrangler.json');await writeFile(configPath,JSON.stringify(config));const state=join(root,'state');const cli=join(repo,'node_modules/wrangler/bin/wrangler.js');const cliEnv={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'};
 const migrated=spawnSync('node',[cli,'d1','migrations','apply','DB','--local','--config',configPath,'--persist-to',state],{cwd:repo,env:cliEnv,input:'y\n',encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});if(migrated.status!==0)throw new Error(JSON.stringify({status:migrated.status,error:migrated.error?.message,tail:(migrated.stderr+migrated.stdout).slice(-3000)}));console.log('Isolated D1 migrations applied');
 const port=await freePort(),inspector=await freePort();api=spawn('node',[cli,'dev','--config',configPath,'--persist-to',state,'--port',String(port),'--ip','127.0.0.1','--inspector-port',String(inspector),'--local','--log-level','error'],{cwd:repo,env:cliEnv,detached:true,stdio:['ignore',log.fd,log.fd]});const baseUrl=`http://127.0.0.1:${port}`;
 let ready=false;for(let i=0;i<120;i++){if(api.exitCode!==null)throw new Error('Isolated API exited');try{const r=await fetch(`${baseUrl}/api/v1/auth/session`);if(r.ok){ready=true;break;}}catch{}await Bun.sleep(250);}if(!ready)throw new Error('Isolated API did not become ready');
 const staging=join(root,'staging');await mkdir(staging);const restored=await launch({operation:'import',context:{baseUrl,accountId:null,token:'',locale:'en-US'},path,stagingDirectory:staging});const manifest=await restored.next('ready');assert.equal(manifest.result.manifest.counts.resources,3);restored.child.send({type:'confirm'});const done=await restored.next('done');
 const target=createEdgeEverClient({baseUrl});const readback=await target.getMemo(memo.id);assert.equal(readback.memo.contentMarkdown,'portable proxy fixture');assert.equal(readback.memo.notebookId,notebook.id);
 for(const {resource,bytes}of resources){const response=await target.getResourceResponse(`/api/v1/resources/${resource.id}/blob`);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);}
 assert.deepEqual(await readdir(staging),[]);assert.equal(restored.messages.filter(x=>x.type==='request-error').length,0);
 const evidence={checkedAt:new Date().toISOString(),scope:'Real Node backup workers; private Bun source stopped before restore; genuine Cloudflare API behind patched Wrangler with fresh D1/R2',restoredResources:3,attachmentBytes:resources.map(x=>x.bytes.length),contentAndHierarchyMatch:true,exactResourceBytesMatch:true,stagingEmpty:true,failedRequests:0,result:done.result};await writeFile(join(repo,'docs/changes/evidence/2026-10-23-desktop-backup/wrangler-backup-replay.json'),JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
} catch(error) {console.error(error);if(api)console.error((await readFile(join(root,'wrangler.log'),'utf8')).split('\n').filter(x=>/ERROR|error|Network|TypeError|Exception/.test(x)).slice(-12).join('\n'));process.exitCode=1;}
finally {for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');source?.stop(true);db?.close();if(api&&api.exitCode===null){process.kill(-api.pid,'SIGTERM');await Promise.race([new Promise(r=>api.once('exit',r)),Bun.sleep(8000)]);if(api.exitCode===null)process.kill(-api.pid,'SIGKILL');}await log.close();await rm(root,{recursive:true,force:true});}
