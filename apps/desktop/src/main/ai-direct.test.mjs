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
