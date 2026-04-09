import { describe, it, expect } from "vite-plus/test";
import { RollingBuffer } from "../src/shared/rolling-buffer.ts";

describe("RollingBuffer", () => {
  it("stores pushed lines and returns them via toString()", () => {
    const buf = new RollingBuffer();
    buf.push("line one");
    buf.push("line two");
    expect(buf.toString()).toBe("line one\nline two\n");
  });

  it("returns empty string when empty", () => {
    const buf = new RollingBuffer();
    expect(buf.toString()).toBe("");
  });

  it("prunes entries older than maxAgeMs", async () => {
    const buf = new RollingBuffer({ maxAgeMs: 50, maxSizeBytes: 100_000 });
    buf.push("old");
    await new Promise((r) => setTimeout(r, 80));
    buf.push("new");
    expect(buf.toString()).toBe("new\n");
  });

  it("prunes entries exceeding maxSizeBytes", () => {
    // Each line ~10 bytes + 1 newline = ~11 bytes
    const buf = new RollingBuffer({ maxAgeMs: 60_000, maxSizeBytes: 25 });
    buf.push("aaaaaaaaaa"); // 10 chars
    buf.push("bbbbbbbbbb"); // 10 chars
    buf.push("cccccccccc"); // 10 chars — should push out first entry
    const result = buf.toString();
    expect(result).not.toContain("aaaaaaaaaa");
    expect(result).toContain("cccccccccc");
  });

  it("ends toString() with newline when entries exist", () => {
    const buf = new RollingBuffer();
    buf.push("hello");
    expect(buf.toString()).toMatch(/\n$/);
  });
});
