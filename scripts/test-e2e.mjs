import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const args = process.argv.slice(2);

if (args[0] === "--") args.shift();

const nodeArgs = existsSync(resolve(process.cwd(), ".env.local"))
  ? ["--env-file=.env.local", playwrightCli, "test", ...args]
  : [playwrightCli, "test", ...args];

const child = spawn(process.execPath, nodeArgs, {
  env: process.env,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (!signal) {
    process.exitCode = code ?? 1;
    return;
  }

  try {
    process.kill(process.pid, signal);
  } catch {
    process.exitCode = 1;
  }
});
