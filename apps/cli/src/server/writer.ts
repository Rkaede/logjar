import fs from "node:fs";
import path from "node:path";
import type { RollingBuffer } from "../shared/rolling-buffer.ts";

const FLUSH_INTERVAL_MS = 300;

/**
 * LogWriter debounce-flushes a RollingBuffer to a file on disk.
 */
export class LogWriter {
  buffer: RollingBuffer;
  filePath: string;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(buffer: RollingBuffer, filePath: string) {
    this.buffer = buffer;
    this.filePath = path.resolve(filePath);

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write empty file so agents can find it immediately
    fs.writeFileSync(this.filePath, "", "utf8");
  }

  /** Schedule a flush (debounced) */
  schedule(): void {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._flush();
    }, FLUSH_INTERVAL_MS);
  }

  _flush(): void {
    try {
      fs.writeFileSync(this.filePath, this.buffer.toString(), "utf8");
    } catch (err) {
      // Don't crash — just warn once to stderr
      process.stderr.write(`[logjar] flush error: ${(err as Error).message}\n`);
    }
  }

  /** Synchronous final flush (used on exit) */
  flushSync(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._flush();
  }
}
