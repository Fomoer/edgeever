import { expect, test } from "bun:test";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { createEdgeEverZip, parseEdgeEverZip } from "../apps/web/src/lib/json-backup";

const manifest = { format: "edgeever-zip", formatVersion: 2, schemaVersion: 1, edgeeverVersion: "2.2.0", buildId: "zip64-fixture", exportedAt: "2026-10-23T00:00:00.000Z", includesTrash: false, counts: { notebooks: 0, memos: 0, revisions: 0, resources: 0, prompts: 0 } };

test("propagates source failures instead of publishing a partial ZIP", async () => {
  await expect(createEdgeEverZip({
    listNotebooks: async () => ({ notebooks: [] }), listPrompts: async () => ({ prompts: [] }),
    getPage: async () => { throw new Error("source unavailable"); },
  }, { edgeeverVersion: "2.2.0", buildId: "test" })).rejects.toThrow("source unavailable");
});

test("reads ZIP64 containers without changing the EdgeEver v2 logical format", async () => {
  const writer = new ZipWriter(new BlobWriter(), { zip64: true, useWebWorkers: false, level: 0 });
  await writer.add("manifest.json", new TextReader(JSON.stringify(manifest)));
  await writer.add("notebooks.json", new TextReader("[]"));
  await writer.add("prompts.json", new TextReader("[]"));
  const archive = await writer.close();
  const parsed = await parseEdgeEverZip(archive);
  expect(parsed.manifest).toEqual(manifest);
  expect(parsed.archive).toBe(archive);
});

test("rejects damaged entry bytes even when their JSON remains valid", async () => {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, level: 0 });
  await writer.add("manifest.json", new TextReader(JSON.stringify(manifest)));
  await writer.add("notebooks.json", new TextReader("[ ]"));
  await writer.add("prompts.json", new TextReader("[]"));
  const bytes = new Uint8Array(await (await writer.close()).arrayBuffer());
  const marker = new TextEncoder().encode("[ ]");
  const index = bytes.findIndex((_, offset) => marker.every((value, i) => bytes[offset + i] === value));
  expect(index).toBeGreaterThan(0);
  bytes[index + 1] = 10;
  await expect(parseEdgeEverZip(new Blob([bytes]))).rejects.toMatchObject({ code: "invalidZip" });
});

for (const stage of ["entry", "write", "close"] as const) test(`preserves ${stage} consumer errors instead of reporting an invalid ZIP`, async () => {
  const { streamZipEntries } = await import("../packages/shared/src/backup-archive");
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, level: 0 });
  await writer.add("resource.bin", new TextReader("resource bytes"));
  const archive = await writer.close();
  const failure = Object.assign(new Error("Target storage unavailable"), { status: 503, code: "object_storage_unavailable" });
  await expect(streamZipEntries(archive, () => {
    if (stage === "entry") throw failure;
    return {
      write: () => { if (stage === "write") throw failure; },
      close: () => { if (stage === "close") throw failure; },
    };
  })).rejects.toBe(failure);
});
