import {
  DEFAULT_BATCH_INTERVAL_MS,
  type FrontendLogMetadata,
  type FrontendSourceKind,
  type LogjarFrontendEntry,
} from "../shared/constants.ts";

export interface LogBatcherOptions {
  app?: string;
  batchInterval?: number;
  sourceKind?: FrontendSourceKind;
  transport: (batch: LogjarFrontendEntry[]) => void | Promise<void>;
}

/** Per-entry fields. An `app` given here overrides the batcher's own. */
export type LogEntryMetadata = FrontendLogMetadata & { app?: string };

export interface LogBatcher {
  enqueue: (level: string, args: ArrayLike<unknown>, metadata?: LogEntryMetadata) => void;
  flush: () => void;
}

export function createLogBatcher({
  app,
  batchInterval = DEFAULT_BATCH_INTERVAL_MS,
  sourceKind,
  transport,
}: LogBatcherOptions): LogBatcher {
  let queue: LogjarFrontendEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (queue.length === 0) return;

    const batch = queue;
    queue = [];

    // Logging must never break the page, so a failed delivery is dropped.
    try {
      void Promise.resolve(transport(batch)).catch(() => {});
    } catch {}
  }

  function enqueue(level: string, args: ArrayLike<unknown>, metadata: LogEntryMetadata = {}): void {
    queue.push({
      level,
      args: Array.from(args).map(serializeLogjarArg),
      app,
      sourceKind,
      ...metadata,
    });

    if (!timer) {
      timer = setTimeout(flush, batchInterval);
    }
  }

  return { enqueue, flush };
}

export function serializeLogjarArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;

  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value) ?? "undefined";
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  // number, boolean, bigint, symbol, undefined and null
  return String(value);
}
