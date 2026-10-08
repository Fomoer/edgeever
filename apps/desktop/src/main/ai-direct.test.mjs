import { expect, test } from "bun:test";
import { createAiDirectRuntime, validateAiProviderUrl } from "./ai-direct.mjs";

test("desktop AI provider transport streams POST bodies to public HTTPS hosts", async () => {
  let received;
  const runtime = createAiDirectRuntime({
    fetchImpl: async (url, init) => {
      received = { url, method: init.method, body: init.body };
      return new Response("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  const chunks = [];
  const opened = await new Promise((resolve, reject) => {
    runtime.open("req-12345", {
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      method: "POST",
      headers: { authorization: "Bearer test" },
      body: "{\"stream\":true}",
    }, {
      onData: (bytes) => chunks.push(new TextDecoder().decode(bytes)),
      onEnd: () => resolve(true),
      onError: reject,
    }).then((headers) => {
      expect(headers.status).toBe(200);
    });
  });
  expect(opened).toBe(true);
  expect(received.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
  expect(received.method).toBe("POST");
  expect(chunks.join("")).toContain("ok");
  expect(runtime.activeCount).toBe(0);
});

test("desktop AI provider transport rejects private hosts and GET", async () => {
  expect(() => validateAiProviderUrl("http://api.openai.com/v1")).toThrow();
  expect(() => validateAiProviderUrl("https://127.0.0.1/v1")).toThrow();
  const runtime = createAiDirectRuntime({ fetchImpl: async () => new Response("no") });
  await expect(runtime.open("req-12345", {
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    method: "GET",
    body: "{}",
  }, { onData() {}, onEnd() {}, onError() {} })).rejects.toThrow(/POST/);
});

test("desktop AI transport sends multipart audio bytes directly to the speech provider", async () => {
  let received;
  const runtime = createAiDirectRuntime({
    fetchImpl: async (url, init) => {
      received = { url, body: init.body, headers: init.headers };
      return Response.json({ text: "recognized" });
    },
  });
  const form = new FormData();
  form.set("model", "whisper-1");
  form.set("file", new File(["audio bytes"], "clip.mp3", { type: "audio/mpeg" }));
  const request = new Request("https://speech.example/v1/audio/transcriptions", { method: "POST", body: form });
  const headers = Object.fromEntries(request.headers);
  const bodyBytes = new Uint8Array(await request.arrayBuffer());
  const result = await new Promise((resolve, reject) => {
    let text = "";
    runtime.open("speech-12345", {
      url: request.url,
      method: "POST",
      headers,
      body: "",
      bodyBytes,
    }, {
      onData: (bytes) => { text += new TextDecoder().decode(bytes); },
      onEnd: () => resolve(text),
      onError: reject,
    }).catch(reject);
  });
  expect(received.url).toBe("https://speech.example/v1/audio/transcriptions");
  expect(received.body).toBeInstanceOf(Uint8Array);
  expect(received.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
  expect(JSON.parse(result).text).toBe("recognized");
  await expect(runtime.open("speech-invalid", {
    url: "https://speech.example/v1/chat/completions",
    method: "POST",
    headers,
    body: "",
    bodyBytes: new Uint8Array([1]),
  }, { onData() {}, onEnd() {}, onError() {} })).rejects.toThrow(/multipart speech/);
});

test("desktop preload and main process expose the AI provider stream pair", async () => {
  const [main, preload] = await Promise.all([
    Bun.file(new URL("./index.mjs", import.meta.url)).text(),
    Bun.file(new URL("../preload/index.cjs", import.meta.url)).text(),
  ]);
  expect(main).toContain('ipcMain.handle("desktop:ai-direct-open"');
  expect(main).toContain('ipcMain.on("desktop:ai-direct-cancel"');
  expect(preload).toContain('openAiProviderStream: (requestId, input) => ipcRenderer.invoke("desktop:ai-direct-open"');
  expect(preload).toContain('ipcRenderer.send("desktop:ai-direct-cancel"');
});
