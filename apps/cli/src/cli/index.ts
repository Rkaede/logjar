#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import {
  DEFAULT_PORT,
  DEFAULT_LOG_FILE,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_MAX_SIZE_BYTES,
  formatEntry,
} from "../shared/constants.ts";
import { RollingBuffer } from "../shared/rolling-buffer.ts";
import { LogWriter } from "../server/writer.ts";
import { startServer } from "../server/http.ts";

// ── Parse arguments ────────────────────────────────────────────────
const argv = process.argv.slice(2);

function flag(name: string, fallback: string | number): string {
  const idx = argv.indexOf(name);
  if (idx === -1) return String(fallback);
  const val = argv.splice(idx, 2)[1]; // remove flag + value
  return val ?? String(fallback);
}

const port = Number(flag("--port", DEFAULT_PORT));
const logFile = flag("--out", DEFAULT_LOG_FILE);
const maxAge = Number(flag("--max-age", DEFAULT_MAX_AGE_MS / 1000)) * 1000; // user gives seconds
const maxSize = Number(flag("--max-size", DEFAULT_MAX_SIZE_BYTES / 1024)) * 1024; // user gives KB

for (const [name, value] of [
  ["--port", port],
  ["--max-age", maxAge],
  ["--max-size", maxSize],
] as const) {
  if (Number.isNaN(value) || value <= 0) {
    console.error(`[logjar] Invalid value for ${name}: must be a positive number`);
    process.exit(1);
  }
}

// Everything after `--` is the child command
const dashIdx = argv.indexOf("--");
const childArgs = dashIdx !== -1 ? argv.slice(dashIdx + 1) : argv;

if (childArgs.length === 0) {
  console.error(
    `Usage: logjar [options] -- <command>\n\nOptions:\n  --port <n>      HTTP port for frontend logs (default: ${DEFAULT_PORT})\n  --out <path>    Log file path (default: ${DEFAULT_LOG_FILE})\n  --max-age <s>   Rolling window in seconds (default: 900)\n  --max-size <kb> Max log file size in KB (default: 200)\n\nExample:\n  logjar -- turbo run dev --parallel`,
  );
  process.exit(1);
}

// ── Set up rolling buffer + writer ──────────────────────────────────
const buffer = new RollingBuffer({ maxAgeMs: maxAge, maxSizeBytes: maxSize });
const writer = new LogWriter(buffer, logFile);

function ingest(line: string): void {
  buffer.push(line);
  writer.schedule();
}

// ── Start HTTP server for frontend logs ─────────────────────────────
const server = startServer({ port, onEntry: ingest });

// ── Spawn the child process ─────────────────────────────────────────
const [cmd, ...args] = childArgs;
const child = spawn(cmd, args, {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  env: {
    ...process.env,
    LOGJAR_PORT: String(port),
    LOGJAR_URL: `http://localhost:${port}`,
  },
});

function handleOutput(stream: NodeJS.ReadableStream, streamName: "stdout" | "stderr"): void {
  let leftover = "";
  stream.on("data", (chunk: Buffer) => {
    // Pass-through to parent's terminal so the developer still sees output
    process[streamName].write(chunk);

    // Split into lines, capturing partial lines
    const text = leftover + chunk.toString();
    const lines = text.split(/\r?\n/);
    leftover = lines.pop()!; // last element may be incomplete
    for (const line of lines) {
      if (line.length === 0) continue;
      ingest(formatEntry("be", streamName === "stdout" ? "info" : "error", [line]));
    }
  });
  stream.on("end", () => {
    if (leftover.length > 0) {
      ingest(formatEntry("be", streamName === "stdout" ? "info" : "error", [leftover]));
      leftover = "";
    }
  });
}

handleOutput(child.stdout!, "stdout");
handleOutput(child.stderr!, "stderr");

// ── Banner ──────────────────────────────────────────────────────────
console.error(
  `[logjar] Capturing logs → ${logFile} (port ${port}, window ${maxAge / 1000}s, cap ${maxSize / 1024}KB)`,
);
console.error(`[logjar] Frontend snippet: import 'logjar/client' or add <script> tag`);

// ── Cleanup ─────────────────────────────────────────────────────────
child.on("exit", (code, signal) => {
  writer.flushSync();
  server.close();
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
