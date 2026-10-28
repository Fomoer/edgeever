const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

module.exports = async () => {
  execFileSync("bun", [join(__dirname, "build-backup-worker.mjs")], { stdio: "inherit" });
};
