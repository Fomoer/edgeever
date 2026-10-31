// Test API for the packaged note window E2E: a temporary SQLite database
// behind the real API. Runs under Bun; prints "READY <url>" once it listens
// and stops when its parent closes stdin.
import { Database } from "bun:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchEdgeEverApp } from "../apps/api/src/index.ts";
import { createSelfHostedStorageAdapter } from "../apps/api/src/self-hosted-storage-adapter.ts";

const directory = process.argv[2];
if (!directory) throw new Error("Pass the test data directory as the first argument.");

const database = new Database(join(directory, "test-api.sqlite"));
for (const name of (await readdir("migrations")).filter((name) => name.endsWith(".sql")).sort()) {
  database.exec(await readFile(join("migrations", name), "utf8"));
}
database.query("INSERT OR IGNORE INTO workspaces(id,name,is_personal) VALUES ('ws_default','Personal',1)").run();
const environment = {
  storage: createSelfHostedStorageAdapter(database, join(directory, "resources")),
  EDGE_EVER_ALLOW_UNAUTHENTICATED: "true",
  EDGE_EVER_RUNTIME: "self-hosted-bun",
};
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: (request) => fetchEdgeEverApp(request, environment, { waitUntil() {}, passThroughOnException() {} }),
});

const stop = () => {
  server.stop(true);
  database.close();
  process.exit(0);
};
process.stdin.on("end", stop);
process.stdin.on("close", stop);
process.stdin.resume();
console.log(`READY http://127.0.0.1:${server.port}`);
