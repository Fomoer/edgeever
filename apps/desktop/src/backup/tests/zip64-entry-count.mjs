// Manual ZIP64 entry-count boundary: bun apps/desktop/src/backup/tests/zip64-entry-count.mjs
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js/index-native.js";
import { parseEdgeEverZip } from "../../../../../packages/shared/src/backup-archive.ts";

const manifest = { format: "edgeever-zip", formatVersion: 2, schemaVersion: 1, edgeeverVersion: "2.2.0", buildId: "zip64-entry-count", exportedAt: new Date().toISOString(), includesTrash: false, counts: { notebooks: 0, memos: 0, revisions: 0, resources: 0, prompts: 0 } };
const writer = new ZipWriter(new BlobWriter(), { level: 0, useWebWorkers: false });
await writer.add("manifest.json", new TextReader(JSON.stringify(manifest)));
await writer.add("notebooks.json", new TextReader("[]"));
await writer.add("prompts.json", new TextReader("[]"));
for (let index = 0; index < 65533; index++) await writer.add(`padding/${index}/`, undefined, { directory: true });
const archive = await writer.close();
const parsed = await parseEdgeEverZip(archive);
if (parsed.manifest.buildId !== manifest.buildId) throw new Error("ZIP64 entry-count boundary failed");
console.log(JSON.stringify({ entries: 65536, archiveBytes: archive.size, parsed: true }));
