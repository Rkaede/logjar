import { parseLogLevels, shouldCaptureLevel, type LogjarLogLevel } from "../shared/constants.ts";

/**
 * logjar browser client (ES module)
 *
 * Side-effect import — just include to start capturing:
 *
 *   import 'logjar/client';
 *
 * Or initialize explicitly with options:
 *
 *   import { initLogjar } from 'logjar/client';
 *   initLogjar({ port: 9000, app: 'web' });
 *
 * Configuration (set before importing, or via <meta> tags):
 *   window.__LOGJAR_PORT = 8797;
 *   window.__LOGJAR_APP  = 'web';
 *   window.__LOGJAR_LEVELS = ['log', 'info', 'warn', 'error'];
 */

declare global {
  interface Window {
    __LOGJAR_PORT?: number | string;
    __LOGJAR_APP?: string;
    __LOGJAR_LEVELS?: string | LogjarLogLevel[];
    __logjar?: { flush: () => void; enqueue: (level: string, args: ArrayLike<unknown>) => void };
  }
}

interface InitLogjarOptions {
  port?: number | string;
  app?: string;
  levels?: string | LogjarLogLevel[];
}

let initialized = false;
let endpoint = "http://localhost:8797/__logjar";
let appName: string | undefined;
let enabledLevels = parseLogLevels();
let queue: Array<{ level: string; args: string[]; app?: string }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushFn: () => void = () => {};
const BATCH_INTERVAL = 500;
const methods = ["log", "info", "warn", "error", "debug"] as const;

function serializeArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint")
    return `${arg}`;
  if (typeof arg === "undefined") return "undefined";
  if (typeof arg === "symbol") return arg.toString();
  if (typeof arg === "function") return `[Function ${arg.name || "anonymous"}]`;
  if (arg === null) return "null";

  try {
    return JSON.stringify(arg) ?? "undefined";
  } catch {
    return Object.prototype.toString.call(arg);
  }
}

function flushQueue(): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  timer = null;

  const body = JSON.stringify(batch);
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    if (sent) return;
  }
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function enqueue(level: string, args: ArrayLike<unknown>): void {
  if (!shouldCaptureLevel(level, enabledLevels)) return;

  const serialized = Array.from(args).map((arg) => serializeArg(arg));

  const entry: { level: string; args: string[]; app?: string } = { level, args: serialized };
  if (appName) entry.app = appName;
  queue.push(entry);
  if (!timer) {
    timer = setTimeout(flushQueue, BATCH_INTERVAL);
  }
}

function patchConsole(): void {
  if (initialized) return;

  for (const method of methods) {
    const original = console[method];
    console[method] = function (...args: unknown[]) {
      enqueue(method, args);
      return original.apply(console, args);
    };
  }

  window.addEventListener("error", (event) => {
    enqueue("error", [
      `Uncaught ${event.error?.name || "Error"}: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
    ]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}`
        : String(event.reason);
    enqueue("error", [`Unhandled rejection: ${reason}`]);
  });

  window.addEventListener("beforeunload", flushQueue);
  window.__logjar = { flush: flushQueue, enqueue };
  flushFn = flushQueue;
  initialized = true;
}

export function initLogjar({ port, app, levels }: InitLogjarOptions = {}): void {
  if (typeof window === "undefined") return;

  const resolvedPort =
    port ||
    window.__LOGJAR_PORT ||
    (document.querySelector('meta[name="logjar-port"]') as HTMLMetaElement | null)?.content ||
    8797;

  const resolvedApp =
    app ||
    window.__LOGJAR_APP ||
    (document.querySelector('meta[name="logjar-app"]') as HTMLMetaElement | null)?.content ||
    undefined;
  const resolvedLevels = parseLogLevels(
    levels ??
      window.__LOGJAR_LEVELS ??
      (document.querySelector('meta[name="logjar-levels"]') as HTMLMetaElement | null)?.content,
  );

  endpoint = `http://localhost:${resolvedPort}/__logjar`;
  appName = resolvedApp;
  enabledLevels = resolvedLevels;
  patchConsole();
  window.__logjar = { flush: flushQueue, enqueue };
}

export function flush(): void {
  flushFn();
}

// Auto-initialize on import
initLogjar();
