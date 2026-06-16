import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

function bin(name) {
  return path.join(root, "node_modules", ".bin", isWindows ? `${name}.cmd` : name);
}

function spawnChild(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      shutdown(code ?? 1);
    }
  });

  children.add(child);
  return child;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host }, () => {
        socket.end();
        resolve();
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

const children = new Set();
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

spawnChild(bin("vite"), ["--host", "127.0.0.1"]);
await waitForPort(5173);
spawnChild(bin("electron"), ["."], {
  CLIPBOARD_SIDEBAR_DEV_SERVER_URL: "http://127.0.0.1:5173"
});
