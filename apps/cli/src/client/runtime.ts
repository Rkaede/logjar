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

export interface LogBatcher {
  enqueue: (level: string, args: ArrayLike<unknown>, metadata?: FrontendLogMetadata) => void;
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
    if (queue.length === 0) return;

    const batch = queue;
    queue = [];
    timer = null;

    void Promise.resolve(transport(batch)).catch(() => {});
  }

  function enqueue(
    level: string,
    args: ArrayLike<unknown>,
    metadata: FrontendLogMetadata = {},
  ): void {
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
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  return String(value);
}
