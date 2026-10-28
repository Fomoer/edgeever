import { Worker } from "node:worker_threads";

let worker;
process.on("message", (message) => {
  if (worker) { worker.postMessage(message); return; }
  worker = new Worker(process.argv[2], { workerData: message });
  worker.on("message", (value) => process.send(value));
  worker.on("error", (error) => process.send({ type: "error", error: { code: error.code, message: error.message } }));
  worker.on("exit", (code) => { process.exitCode = code; process.disconnect(); });
});
process.on("disconnect", () => { void worker?.terminate(); });
