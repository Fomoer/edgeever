import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { restoreEdgeEverZip } from "../../../../../packages/shared/src/backup-archive.ts";

const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, level: 0 });
await writer.add("resource.bin", new TextReader("resource bytes"));
const zip = await writer.close();
const archive = {
  size: zip.size,
  slice(start, end) {
    return {
      async arrayBuffer() {
        // Disk reads yield to the event loop before the entry can consume data.
        await new Promise(setImmediate);
        return zip.slice(start, end).arrayBuffer();
      },
    };
  },
};
const failure = Object.assign(new Error("Target storage unavailable"), { status: 503, code: "object_storage_unavailable" });
await restoreEdgeEverZip({
  archive, notebooks: [], prompts: [],
  memos: [{ resources: [{ id: "resource-1", archivePath: "resource.bin", byteSize: 14 }] }],
  manifest: { counts: { resources: 1 } },
}, {
  restoreNotebooks: async () => {}, restoreMemos: async () => {}, restorePrompts: async () => {},
  createResourceRestoreSink: async () => { throw failure; },
}).then(() => {
  throw new Error("Expected upload initialization to fail");
}, error => {
  console.log(JSON.stringify({ status: error.status, code: error.code, message: error.message }));
});
