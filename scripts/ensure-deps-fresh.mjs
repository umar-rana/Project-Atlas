#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const LOCK = "package-lock.json";
const STAMP = "node_modules/.package-lock.json";

function log(msg) {
  console.log(`[ensure-deps] ${msg}`);
}

if (!existsSync(LOCK)) {
  log("no package-lock.json — skipping");
  process.exit(0);
}

const needsInstall = !existsSync(STAMP) || statSync(LOCK).mtimeMs > statSync(STAMP).mtimeMs;

if (!needsInstall) {
  process.exit(0);
}

log("package-lock.json is newer than node_modules — running npm install");
const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
