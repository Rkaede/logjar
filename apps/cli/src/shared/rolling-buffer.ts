import { DEFAULT_MAX_AGE_MS, DEFAULT_MAX_SIZE_BYTES } from "./constants.ts";

interface BufferEntry {
  ts: number;
  line: string;
  bytes: number;
}

interface RollingBufferOptions {
  maxAgeMs?: number;
  maxSizeBytes?: number;
}

/**
 * RollingBuffer keeps log entries trimmed by age and total byte size.
 * When flushed to disk it writes only the entries that fit within both caps.
 */
export class RollingBuffer {
  maxAgeMs: number;
  maxSizeBytes: number;
  entries: BufferEntry[];
  private _totalBytes = 0;

  constructor({
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  }: RollingBufferOptions = {}) {
    this.maxAgeMs = maxAgeMs;
    this.maxSizeBytes = maxSizeBytes;
    this.entries = [];
  }

  push(line: string): void {
    const bytes = Buffer.byteLength(line, "utf8") + 1; // +1 for newline
    this.entries.push({ ts: Date.now(), line, bytes });
    this._totalBytes += bytes;
    this._prune();
  }

  _prune(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    let dropCount = 0;

    // Drop entries older than maxAge, then the oldest ones until the total
    // size fits within the cap. The running total keeps a push cheap.
    while (
      dropCount < this.entries.length &&
      (this.entries[dropCount].ts < cutoff || this._totalBytes > this.maxSizeBytes)
    ) {
      this._totalBytes -= this.entries[dropCount].bytes;
      dropCount++;
    }

    if (dropCount > 0) {
      this.entries.splice(0, dropCount);
    }
  }

  toString(): string {
    this._prune();
    return this.entries.map((e) => e.line).join("\n") + (this.entries.length ? "\n" : "");
  }
}
