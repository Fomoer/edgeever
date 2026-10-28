import { expect, test } from "bun:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { Writable } from "node:stream";
import { createGzip, gunzipSync } from "node:zlib";

const require = createRequire(new URL("../packages/wrangler/bin/wrangler.js", import.meta.url));
const packageRoot = dirname(require.resolve("edgeever-wrangler-cli/package.json"));
// Exercise the installed artifact that Wrangler actually loads, without
// sharing a mocked global fetch with other tests or starting a real service.
const source = readFileSync(join(packageRoot, "wrangler-dist/ProxyWorker.js"), "utf8")
  .replace('import assert from "node:assert";', "const assert = globalThis.assert;")
  .replace(/export \{[\s\S]*?\};\s*$/, "globalThis.ProxyWorker = ProxyWorker;");

const fixture = (target = "http://127.0.0.1:7000", forward = () => Response.json({ ok: true })) => {
  const calls = [];
  const events = [];
  const dispatch = async (transport, url, request) => {
    calls.push({ transport, url: url.href, request });
    return forward(url, request);
  };
  const sandbox = {
    assert, Request, Response, Headers, URL, Map,
    fetch: (url, request) => dispatch("native", url, request),
  };
  runInNewContext(source, sandbox);
  const proxy = new sandbox.ProxyWorker({ getWebSockets: () => [] }, {
    LOCAL_HTTP: { fetch: request => dispatch("node", new URL(request.url), request) },
    PROXY_CONTROLLER_AUTH_SECRET: "fixture-control",
    PROXY_CONTROLLER: { fetch: async (_url, init) => { events.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); } },
  });
  const url = new URL(target);
  proxy.proxyData = { userWorkerUrl: { protocol: url.protocol, hostname: url.hostname, port: url.port } };
  return { proxy, calls, events };
};
const request = (init = {}) => new Request("http://outer.test/api/restore?part=1", init);

for (const host of ["127.0.0.1", "localhost", "[::1]"]) test(`local proxy forwards ordinary HTTP through the Node adapter for ${host}`, async () => {
  const f = fixture(`http://${host}:7000`);
  const response = await f.proxy.fetch(request({ method: "POST", body: "restore metadata" }));
  expect(response.status).toBe(200);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].transport).toBe("node");
  expect(f.calls[0].request.method).toBe("POST");
  expect(await f.calls[0].request.text()).toBe("restore metadata");
});

for (const target of ["https://127.0.0.1:7000", "https://preview.example", "http://remote.example"]) test(`proxy keeps existing connection behavior for ${target}`, async () => {
  const f = fixture(target);
  await f.proxy.fetch(request());
  expect(f.calls[0].transport).toBe("native");
  expect(f.calls[0].request.headers.has("Connection")).toBe(false);
});

test("local WebSocket forwarding keeps its Upgrade connection", async () => {
  const f = fixture();
  await f.proxy.fetch(request({ headers: { Upgrade: "websocket", Connection: "Upgrade" } }));
  expect(f.calls[0].transport).toBe("native");
  expect(f.calls[0].request.headers.get("Connection")).toBe("Upgrade");
  expect(f.calls[0].request.headers.get("Upgrade")).toBe("websocket");
});

for (const method of ["GET", "POST"]) test(`${method} connection failure on an unchanged worker is reported without retry`, async () => {
  const failure = new Error("Network connection lost");
  const f = fixture(undefined, () => { throw failure; });
  const result = await Promise.race([
    f.proxy.fetch(request({ method })).then(value => value, error => error),
    Bun.sleep(50).then(() => "unresolved"),
  ]);
  expect(result).toBe(failure);
  expect(f.events).toMatchObject([{ type: "error", error: { message: failure.message } }]);
  expect(f.calls).toHaveLength(1);
  expect(f.proxy.requestRetryQueue.size).toBe(0);
});

test("actual worker replacement keeps POST failure non-retryable", async () => {
  const f = fixture(undefined, () => { f.proxy.proxyData = undefined; throw new Error("Disconnected during reload"); });
  const response = await f.proxy.fetch(request({ method: "POST" }));
  expect(response.status).toBe(503);
  expect(f.calls).toHaveLength(1);
  expect(f.proxy.requestRetryQueue.size).toBe(0);
  expect(f.events).toHaveLength(0);
});

test("actual worker replacement keeps GET queued until play", async () => {
  const f = fixture(undefined, () => {
    if (f.calls.length === 1) { f.proxy.proxyData = undefined; throw new Error("Disconnected during reload"); }
    return Response.json({ ok: true });
  });
  const response = f.proxy.fetch(request());
  await Bun.sleep(0);
  expect(f.proxy.requestRetryQueue.size).toBe(1);
  f.proxy.processProxyControllerRequest({ cf: { hostMetadata: { type: "play", proxyData: { userWorkerUrl: { protocol: "http:", hostname: "127.0.0.1", port: "7001" } } } } });
  expect((await response).status).toBe(200);
  expect(f.calls).toHaveLength(2);
  expect(f.calls[1].url).toBe("http://127.0.0.1:7001/api/restore?part=1");
});

const miniflareRequire = createRequire(join(packageRoot, "package.json"));
const miniflareSource = readFileSync(join(dirname(miniflareRequire.resolve("miniflare/package.json")), "dist/src/index.js"), "utf8");
const writeStart = miniflareSource.indexOf("  async #writeResponse(response, res) {");
const writeEnd = miniflareSource.indexOf("  async #getLoopbackPort()", writeStart);
const writeResponse = runInNewContext(`(${miniflareSource.slice(writeStart, writeEnd)
  .replace("async #writeResponse", "async function writeResponse")
  .replaceAll("this.#log", "this.log")})`, {
  _transformsForContentEncodingAndContentType: encoding => encoding === "gzip" ? [createGzip()] : [], Promise, Error, require,
});

const slowResponse = () => {
  const pending = [];
  const res = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) { pending.push(callback); } });
  res.writeHead = () => {};
  return { res, pending };
};

test("local loopback does not read ahead when its response is backpressured", async () => {
  const f = slowResponse(); let produced = 0;
  const body = (async function* () { for (let i = 0; i < 4; i++) { produced++; yield new Uint8Array(128 * 1024).fill(i); } })();
  const writing = writeResponse.call({ log: { debug() {} } }, { headers: new Headers(), body, status: 200 }, f.res);
  try {
    await Bun.sleep(0);
    // A stream pipeline may prefetch one source chunk beside the blocked sink.
    expect(produced).toBeLessThanOrEqual(2);
    for (let i = 0; i < 8; i++) {
      f.pending.shift()?.();
      await Bun.sleep(0);
    }
    await writing;
    expect(produced).toBe(4);
  } finally { f.res.destroy(); await writing; }
});

test("local loopback cancels its upstream reader when a blocked downstream closes", async () => {
  const f = slowResponse(); let produced = 0; let closed = false;
  const body = (async function* () { try { for (let i = 0; i < 4; i++) { produced++; yield new Uint8Array(128 * 1024).fill(i); } } finally { closed = true; } })();
  const writing = writeResponse.call({ log: { debug() {} } }, { headers: new Headers(), body, status: 200 }, f.res);
  await Bun.sleep(0); f.res.destroy(); await writing;
  expect(produced).toBeLessThanOrEqual(2);
  expect(closed).toBe(true);
});

test("local loopback preserves a valid compressed empty response", async () => {
  const chunks = [];
  const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } });
  res.writeHead = () => {};
  await writeResponse.call({ log: { debug() {} } }, { headers: new Headers({ "Content-Encoding": "gzip" }), body: null, status: 200 }, res);
  expect(gunzipSync(Buffer.concat(chunks))).toEqual(Buffer.alloc(0));
});
