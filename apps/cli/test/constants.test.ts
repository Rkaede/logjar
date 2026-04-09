import { describe, it, expect } from "vite-plus/test";
import {
  DEFAULT_PORT,
  DEFAULT_LOG_FILE,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_BATCH_INTERVAL_MS,
  DEFAULT_FRONTEND_LOG_LEVELS,
  LOG_ENDPOINT,
  formatEntry,
  parseLogLevels,
  shouldCaptureLevel,
} from "../src/shared/constants.ts";

describe("constants", () => {
  it("has expected default values", () => {
    expect(DEFAULT_PORT).toBe(8797);
    expect(DEFAULT_LOG_FILE).toBe(".logjar/logs.txt");
    expect(DEFAULT_MAX_AGE_MS).toBe(15 * 60 * 1000);
    expect(DEFAULT_MAX_SIZE_BYTES).toBe(200 * 1024);
    expect(LOG_ENDPOINT).toBe("/__logjar");
    expect(DEFAULT_BATCH_INTERVAL_MS).toBe(500);
    expect(DEFAULT_FRONTEND_LOG_LEVELS).toEqual(["log", "info", "warn", "error"]);
  });
});

describe("parseLogLevels", () => {
  it("defaults to all non-debug frontend levels", () => {
    expect(parseLogLevels()).toEqual(["log", "info", "warn", "error"]);
  });

  it("parses a comma-delimited string", () => {
    expect(parseLogLevels("error, debug ,warn")).toEqual(["warn", "error", "debug"]);
  });

  it("parses an array and normalizes case", () => {
    expect(parseLogLevels(["DEBUG", "error", "debug", "invalid"])).toEqual(["error", "debug"]);
  });

  it("returns an empty list when no valid levels are requested", () => {
    expect(parseLogLevels("verbose,trace")).toEqual([]);
  });
});

describe("shouldCaptureLevel", () => {
  it("matches enabled levels", () => {
    expect(shouldCaptureLevel("warn", ["warn", "error"])).toBe(true);
    expect(shouldCaptureLevel("debug", ["warn", "error"])).toBe(false);
  });
});

describe("formatEntry", () => {
  it("formats a frontend log entry", () => {
    const entry = formatEntry("fe", "log", ["hello"]);
    expect(entry).toMatch(/^\[.+\] \[FE\] \[LOG\] hello$/);
  });

  it("formats a backend error entry", () => {
    const entry = formatEntry("be", "error", ["fail"]);
    expect(entry).toMatch(/^\[.+\] \[BE\] \[ERROR\] fail$/);
  });

  it("joins multiple args with space", () => {
    const entry = formatEntry("fe", "warn", ["a", "b", "c"]);
    expect(entry).toMatch(/\[WARN\] a b c$/);
  });

  it("JSON-stringifies object args", () => {
    const entry = formatEntry("fe", "log", [{ key: "val" }]);
    expect(entry).toContain('{"key":"val"}');
  });

  it("includes an ISO timestamp", () => {
    const entry = formatEntry("fe", "log", ["x"]);
    const ts = entry.match(/^\[(.+?)\]/)![1];
    expect(Number.isNaN(Date.parse(ts))).toBe(false);
  });

  it("includes app name in tag when provided", () => {
    const entry = formatEntry("fe", "log", ["hello"], "web");
    expect(entry).toMatch(/\[FE:web\]/);
  });

  it("omits app name from tag when not provided", () => {
    const entry = formatEntry("fe", "log", ["hello"]);
    expect(entry).toMatch(/\[FE\]/);
    expect(entry).not.toContain("FE:");
  });

  it("includes app name for backend entries", () => {
    const entry = formatEntry("be", "info", ["msg"], "api");
    expect(entry).toMatch(/\[BE:api\]/);
  });

  it("tags extension-originated frontend entries distinctly", () => {
    const entry = formatEntry("fe", "warn", ["request failed"], undefined, {
      sourceKind: "extension",
    });
    expect(entry).toMatch(/\[FE:ext\]/);
  });

  it("appends page context when provided", () => {
    const entry = formatEntry("fe", "error", ["boom"], "web", {
      pageTitle: 'Local "Demo"',
      pageUrl: "http://localhost:5173/demo",
    });
    expect(entry).toContain("[FE:web]");
    expect(entry).toContain('title="Local \\"Demo\\""');
    expect(entry).toContain("url=http://localhost:5173/demo");
  });
});
