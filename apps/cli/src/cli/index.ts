#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import { StringDecoder } from "node:string_decoder";
import { formatEntry } from "../shared/constants.ts";
import { RollingBuffer } from "../shared/rolling-buffer.ts";
import { LogWriter } from "../server/writer.ts";
import { getListeningPort, startServer } from "../server/http.ts";
import { createChildEnvironment } from "./config.ts";
import { parseArgs, toShellCommand, UsageError, USAGE, type CliOptions } from "./args.ts";

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

function fail(message: string): never {
  console.error(`[logjar] ${message}`);
  process.exit(1);
}

// ── Set up rolling buffer + writer ──────────────────────────────────
const buffer = new RollingBuffer({ maxAgeMs, maxSizeBytes });
let writer: LogWriter | undefined;

function ingest(line: string): void {
  buffer.push(line);
  writer?.schedule();
}

// ── Start HTTP server for frontend logs ─────────────────────────────
// The child starts only once the port is ours. Otherwise a second logjar on
// the same port would crash after it had already started the command.
const server = await startServer({ port, onEntry: ingest }).catch((error: NodeJS.ErrnoException) =>
  fail(
    error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Is another logjar running? Pick another port with --port or LOGJAR_PORT.`
      : `Could not start the log server on port ${port}: ${error.message}`,
  ),
);
server.on("error", (error) => {
  console.error(`[logjar] Log server error: ${error.message}`);
});

// With port 0 the operating system picks the port, so read back the real one.
const actualPort = getListeningPort(server);

try {
  writer = new LogWriter(buffer, logFile);
} catch (error) {
  fail(`Could not write ${logFile}: ${(error as Error).message}`);
}

runChild(writer);

// ── Spawn the child process ─────────────────────────────────────────
function runChild(logWriter: LogWriter): void {
  const child = spawn(toShellCommand(command), {
    stdio: ["inherit", "pipe", "pipe"],
    shell: true,
    env: createChildEnvironment(process.env, actualPort),
  });

  handleOutput(child.stdout, "stdout");
  handleOutput(child.stderr, "stderr");

  // ── Banner ────────────────────────────────────────────────────────
  console.error(
    `[logjar] Capturing logs → ${logFile} (port ${actualPort}, window ${maxAgeMs / 1000}s, cap ${maxSizeBytes / 1024}KB)`,
  );
  console.error(`[logjar] Frontend snippet: import 'logjar/client' or add <script> tag`);

  // ── Cleanup ───────────────────────────────────────────────────────
  const forwardedSignals = ["SIGINT", "SIGTERM"] as const;
  for (const sig of forwardedSignals) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }

  child.on("error", (error) => {
    logWriter.flushSync();
    fail(`Could not run the command: ${error.message}`);
  });

  // "close" fires after the output streams have ended, so the last lines are
  // captured before the final flush. "exit" can fire while data is unread.
  child.on("close", (code, signal) => {
    logWriter.flushSync();
    server.close();
    if (signal) {
      // Our own forwarding handlers would swallow the signal we re-raise.
      for (const sig of forwardedSignals) process.removeAllListeners(sig);
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

function handleOutput(stream: NodeJS.ReadableStream, streamName: "stdout" | "stderr"): void {
  const level = streamName === "stdout" ? "info" : "error";
  // Decodes across chunk boundaries, so a split multi-byte character survives.
  const decoder = new StringDecoder("utf8");
  let leftover = "";

  function ingestLines(text: string): void {
    const lines = (leftover + text).split(/\r?\n/);
    leftover = lines.pop()!; // last element may be incomplete
    for (const line of lines) {
      if (line.length === 0) continue;
      ingest(formatEntry("be", level, [line]));
    }
  }

  stream.on("data", (chunk: Buffer) => {
    // Pass-through to parent's terminal so the developer still sees output
    process[streamName].write(chunk);
    ingestLines(decoder.write(chunk));
  });
  stream.on("end", () => {
    ingestLines(decoder.end());
    if (leftover.length > 0) {
      ingest(formatEntry("be", level, [leftover]));
      leftover = "";
    }
  });
}
