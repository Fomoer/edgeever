// Manual acceptance: bun apps/desktop/src/backup/tests/large-archive.mjs
// Requires approximately 15 GiB of temporary disk space; removes its own fixtures.
import { Database } from "bun:sqlite";
import { fork, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, open, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
const root = process.cwd();
const { fetchEdgeEverApp } = await import(join(root, "apps/api/src/index.ts"));
const { createSelfHostedStorageAdapter } = await import(join(root, "apps/api/src/self-hosted-storage-adapter.ts"));
const { createEdgeEverClient } = await import(join(root, "packages/client/src/index.ts"));
const directory = await mkdtemp(join(tmpdir(), "edgeever-backup-large-")); const servers = []; const dbs = []; const children = [];
const create = async (name) => {
 const folder = join(directory, name); await mkdir(folder);
 const db = new Database(join(folder, "db.sqlite")); dbs.push(db);
 for (const file of (await readdir("migrations")).filter(n => n.endsWith(".sql")).sort()) db.exec(await readFile(join("migrations", file), "utf8"));
 const resources = join(folder, "objects");
 const env = { storage: createSelfHostedStorageAdapter(db, resources), EDGE_EVER_ALLOW_UNAUTHENTICATED: "true", EDGE_EVER_RUNTIME: "self-hosted-bun" };
 const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: r => fetchEdgeEverApp(r, env, { waitUntil() {}, passThroughOnException() {} }) }); servers.push(server);
 const baseUrl = `http://127.0.0.1:${server.port}`; return { db, server, resources, baseUrl, client: createEdgeEverClient({ baseUrl }) };
};
const node = execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();
let peakRssKiB = 0; let stage = "export"; const peaks = {};
const bundle = join(directory, "instrumented-worker.mjs");
await writeFile(bundle, `import { parentPort as memoryPort } from "node:worker_threads";
const memoryTimer = setInterval(() => memoryPort?.postMessage({type:"memory", result:process.memoryUsage()}),100); memoryTimer.unref();
` + await readFile(join(root, "apps/desktop/build/backup-worker.mjs"), "utf8"));
const launch = (data) => {
 const child = fork(join(root, "apps/desktop/src/backup/tests/node-worker-runner.mjs"), [bundle], { execPath: node, stdio: ["ignore", "ignore", "inherit", "ipc"] }); children.push(child);
 const messages=[];let notify;
 child.on("message", m=>{ if (m.type === "memory") { const p = peaks[stage] ??= { rss:0, external:0, heapUsed:0, arrayBuffers:0 }; for (const key of Object.keys(p)) p[key] = Math.max(p[key],m.result[key]); return; } messages.push(m); notify?.();}); child.send(data);
 const sample=setInterval(()=>{try{peakRssKiB=Math.max(peakRssKiB,Number(execFileSync("ps",["-p",String(child.pid),"-o","rss="],{encoding:"utf8"}).trim()));}catch{}},1000);
 child.on("exit",()=>clearInterval(sample));
 const next=async(type)=>{while(true){const e=messages.find(m=>m.type==="error");if(e)throw new Error(JSON.stringify(e));const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0].result;await new Promise(r=>notify=r);}};
 return {child,next};
};
const started=Date.now();
try {
 const source=await create("source"); const {notebook}=await source.client.createNotebook({name:"Large archive"});const {memo}=await source.client.createMemo({notebookId:notebook.id,title:"ZIP64 >4 GiB",contentMarkdown:"Five streamed 900 MiB attachments."});
 const size=900*1024*1024;
 for(let i=0;i<5;i++) {const {resource}=await source.client.uploadMemoResource(memo.id,new File([new Uint8Array([0])],`part-${i}.bin`,{type:"application/octet-stream"}));const row=source.db.query("SELECT object_key FROM resources WHERE id=?").get(resource.id); const file=await open(join(source.resources,row.object_key),"r+");try{await file.truncate(size);}finally{await file.close();}source.db.query("UPDATE resources SET byte_size=?,sha256=NULL WHERE id=?").run(size,resource.id);}
 console.log("Large source ready",{bytes:5*size});
 const path=join(directory,"large.zip");const job=launch({operation:"export",context:{baseUrl:source.baseUrl,accountId:null,token:""},path,version:{edgeeverVersion:"2.2.0",buildId:"large-acceptance"}});
 const exported=await job.next("done");if(exported.size<=2**32)throw new Error("Archive is not >4 GiB");console.log("Large export complete",{bytes:exported.size,seconds:(Date.now()-started)/1000});
 source.server.stop(true);
 stage = "scan"; const target=await create("target");const staging=join(directory,"private");await mkdir(staging,{mode:0o700});
 const restore=launch({operation:"import",context:{baseUrl:target.baseUrl,accountId:null,token:""},path,stagingDirectory:staging});
 const checked=await restore.next("ready");if(checked.manifest.counts.resources!==5)throw new Error("Wrong resource count");if(target.db.query("SELECT id FROM memos WHERE id=?").get(memo.id))throw new Error("Wrote before confirmation");
 console.log("Large scan complete",{seconds:(Date.now()-started)/1000});stage = "restore"; restore.child.send({type:"confirm"});await restore.next("done");
 for(const row of target.db.query("SELECT object_key,sha256,byte_size FROM resources WHERE memo_id=?").all(memo.id)){const file=join(target.resources,row.object_key);if((await stat(file)).size!==size)throw new Error("Restored length differs");const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);if(hash.digest("hex")!==row.sha256)throw new Error("Restored digest differs");}
 const result={archiveBytes:exported.size,resources:5,resourceBytes:size,seconds:(Date.now()-started)/1000,peakWorkerRssMiB:Math.round(peakRssKiB/1024),phasePeaks:peaks,restored:true,sourceDisconnected:true};
 if (process.env.EDGE_EVER_BACKUP_REPORT) await writeFile(process.env.EDGE_EVER_BACKUP_REPORT,JSON.stringify(result,null,2));console.log(result); if (peaks.restore.rss > 1024**3) throw new Error("Restoring a 4.7 GB archive exceeded the 1 GiB RSS acceptance budget");
} finally {for(const child of children)if(child.connected)child.kill("SIGTERM");for(const server of servers)server.stop(true);for(const db of dbs)db.close();await rm(directory,{recursive:true,force:true});}
