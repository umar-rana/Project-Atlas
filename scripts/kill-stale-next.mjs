#!/usr/bin/env node
import { readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { createConnection } from "node:net";

const PORT = Number(process.env.PORT || 5000);
const REPO_ROOT = process.cwd();
const OWN_PID = process.pid;
const OWN_PPID = process.ppid;

function log(msg) {
  console.log(`[kill-stale-next] ${msg}`);
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: "127.0.0.1" });
    const done = (free) => {
      try {
        sock.destroy();
      } catch {}
      resolve(free);
    };
    sock.once("connect", () => done(false));
    sock.once("error", () => done(true));
    setTimeout(() => done(true), 300);
  });
}

function readListeningInodes(port) {
  const portHex = port.toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = contents.split("\n").slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const localAddr = parts[1];
      const state = parts[3];
      const inode = parts[9];
      if (state !== "0A") continue;
      if (!localAddr || !localAddr.endsWith(`:${portHex}`)) continue;
      if (inode && inode !== "0") inodes.add(inode);
    }
  }
  return inodes;
}

function findPidsForInodes(inodes) {
  const pids = new Set();
  if (inodes.size === 0) return pids;
  let pidDirs = [];
  try {
    pidDirs = readdirSync("/proc").filter((n) => /^\d+$/.test(n));
  } catch {
    return pids;
  }
  for (const pid of pidDirs) {
    const fdDir = `/proc/${pid}/fd`;
    let fds = [];
    try {
      fds = readdirSync(fdDir);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let target;
      try {
        target = readlinkSync(`${fdDir}/${fd}`);
      } catch {
        continue;
      }
      const m = target.match(/^socket:\[(\d+)\]$/);
      if (m && inodes.has(m[1])) {
        pids.add(Number(pid));
        break;
      }
    }
  }
  return pids;
}

function pidCwd(pid) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

function pidCmdline(pid) {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    return raw.replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

async function waitForPortFree(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortFree(port)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function main() {
  if (await isPortFree(PORT)) return;

  const inodes = readListeningInodes(PORT);
  const pids = findPidsForInodes(inodes);

  const targets = [];
  for (const pid of pids) {
    if (pid === OWN_PID || pid === OWN_PPID) continue;
    const cwd = pidCwd(pid);
    if (cwd !== REPO_ROOT) {
      log(`skip pid=${pid} cwd=${cwd ?? "?"} (not this repo)`);
      continue;
    }
    targets.push({ pid, cmd: pidCmdline(pid) });
  }

  if (targets.length === 0) {
    log(`port ${PORT} busy but no owned-by-this-repo process found; leaving alone`);
    return;
  }

  for (const { pid, cmd } of targets) {
    try {
      process.kill(pid, "SIGTERM");
      log(`SIGTERM pid=${pid} cmd="${cmd}"`);
    } catch (err) {
      log(`SIGTERM failed pid=${pid}: ${err.message}`);
    }
  }

  if (await waitForPortFree(PORT, 2000)) return;

  for (const { pid } of targets) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
      log(`SIGKILL pid=${pid}`);
    } catch {}
  }

  await waitForPortFree(PORT, 2000);
}

main().catch((err) => {
  console.warn(`[kill-stale-next] error: ${err.message}`);
});
