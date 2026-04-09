import { DEFAULT_MAX_AGE_MS, DEFAULT_MAX_SIZE_BYTES } from "./constants.ts";

interface BufferEntry {
  ts: number;
  line: string;
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

  constructor({
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  }: RollingBufferOptions = {}) {
    this.maxAgeMs = maxAgeMs;
    this.maxSizeBytes = maxSizeBytes;
    this.entries = [];
  }

  push(line: string): void {
    this.entries.push({ ts: Date.now(), line });
    this._prune();
  }

  _prune(): void {
    const cutoff = Date.now() - this.maxAgeMs;

    // Drop entries older than maxAge
    while (this.entries.length > 0 && this.entries[0].ts < cutoff) {
      this.entries.shift();
    }

    // Drop oldest entries until total size fits within cap
    let totalBytes = this._totalBytes();
    while (totalBytes > this.maxSizeBytes && this.entries.length > 0) {
      const removed = this.entries.shift()!;
      totalBytes -= Buffer.byteLength(removed.line, "utf8") + 1; // +1 for newline
    }
  }

  _totalBytes(): number {
    let bytes = 0;
    for (const e of this.entries) {
      bytes += Buffer.byteLength(e.line, "utf8") + 1;
    }
    return bytes;
  }

  toString(): string {
    this._prune();
    return this.entries.map((e) => e.line).join("\n") + (this.entries.length ? "\n" : "");
  }
}
