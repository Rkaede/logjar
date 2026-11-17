#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import { formatEntry } from "../shared/constants.ts";
import { RollingBuffer } from "../shared/rolling-buffer.ts";
import { LogWriter } from "../server/writer.ts";
import { getListeningPort, startServer } from "../server/http.ts";
import { createChildEnvironment } from "./config.ts";
import { parseArgs, UsageError, USAGE, type CliOptions } from "./args.ts";

// ── Parse arguments ────────────────────────────────────────────────
let options: CliOptions;
try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === "help") {
    console.log(USAGE);
    process.exit(0);
  }
  options = parsed;
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(`[logjar] ${error.message}\n\n${USAGE}`);
  process.exit(1);
}

const { port, logFile, maxAgeMs, maxSizeBytes, command } = options;

// ── Set up rolling buffer + writer ──────────────────────────────────
const buffer = new RollingBuffer({ maxAgeMs, maxSizeBytes });
const writer = new LogWriter(buffer, logFile);

function ingest(line: string): void {
  buffer.push(line);
  writer.schedule();
}

// ── Start HTTP server for frontend logs ─────────────────────────────
const server = await startServer({ port, onEntry: ingest });
const actualPort = getListeningPort(server);

// ── Spawn the child process ─────────────────────────────────────────
const [cmd, ...args] = command;
const child = spawn(cmd, args, {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  env: createChildEnvironment(process.env, actualPort),
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
  `[logjar] Capturing logs → ${logFile} (port ${actualPort}, window ${maxAgeMs / 1000}s, cap ${maxSizeBytes / 1024}KB)`,
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
