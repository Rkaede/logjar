import {
  DEFAULT_PORT,
  LOG_ENDPOINT,
  LOG_LEVELS,
  parseLogLevels,
  shouldCaptureLevel,
  type LogjarFrontendEntry,
  type LogjarLogLevel,
} from "../shared/constants.ts";
import { createLogBatcher, serializeLogjarArg } from "./runtime.ts";

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
let endpoint = buildEndpoint(DEFAULT_PORT);
let appName: string | undefined;
let enabledLevels = parseLogLevels();
// The endpoint and app name are read when used, so a later initLogjar() call
// also applies to entries that are still queued.
const batcher = createLogBatcher({ transport: send });

function buildEndpoint(port: number | string): string {
  return `http://localhost:${port}${LOG_ENDPOINT}`;
}

function send(batch: LogjarFrontendEntry[]): void {
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
  batcher.enqueue(level, args, appName ? { app: appName } : undefined);
}

function patchConsole(): void {
  if (initialized) return;

  for (const method of LOG_LEVELS) {
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
    enqueue("error", [`Unhandled rejection: ${serializeLogjarArg(event.reason)}`]);
  });

  window.addEventListener("beforeunload", flush);
  window.__logjar = { flush, enqueue };
  initialized = true;
}

export function initLogjar({ port, app, levels }: InitLogjarOptions = {}): void {
  if (typeof window === "undefined") return;

  const resolvedPort =
    port ||
    window.__LOGJAR_PORT ||
    (document.querySelector('meta[name="logjar-port"]') as HTMLMetaElement | null)?.content ||
    DEFAULT_PORT;

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

  endpoint = buildEndpoint(resolvedPort);
  appName = resolvedApp;
  enabledLevels = resolvedLevels;
  patchConsole();
}

export function flush(): void {
  batcher.flush();
}

// Auto-initialize on import
initLogjar();
