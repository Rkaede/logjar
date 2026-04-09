import { afterEach, describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LogWriter } from "../src/server/writer.ts";
import { RollingBuffer } from "../src/shared/rolling-buffer.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "logjar-test-"));
}

let cleanupDir: string | null = null;

afterEach(() => {
  if (cleanupDir) {
    fs.rmSync(cleanupDir, { recursive: true, force: true });
    cleanupDir = null;
  }
});

describe("LogWriter", () => {
  it("creates parent directories and an empty file on construction", () => {
    const dir = tmpDir();
    cleanupDir = dir;

    const filePath = path.join(dir, "sub", "deep", "logs.txt");
    const buf = new RollingBuffer();
    new LogWriter(buf, filePath);

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe("");
  });

  it("flushSync() writes buffer contents to disk", () => {
    const dir = tmpDir();
    cleanupDir = dir;

    const filePath = path.join(dir, "logs.txt");
    const buf = new RollingBuffer();
    const writer = new LogWriter(buf, filePath);

    buf.push("hello world");
    writer.flushSync();

    const contents = fs.readFileSync(filePath, "utf8");
    expect(contents).toBe("hello world\n");
  });

  it("schedule() eventually writes to disk", async () => {
    const dir = tmpDir();
    cleanupDir = dir;

    const filePath = path.join(dir, "logs.txt");
    const buf = new RollingBuffer();
    const writer = new LogWriter(buf, filePath);

    buf.push("scheduled write");
    writer.schedule();

    await new Promise((r) => setTimeout(r, 500));
    const contents = fs.readFileSync(filePath, "utf8");
    expect(contents).toBe("scheduled write\n");
  });
});
