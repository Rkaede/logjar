import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createLogBatcher,
  formatUncaughtError,
  serializeLogjarArg,
} from "../src/client/runtime.ts";
import type { LogjarFrontendEntry } from "../src/shared/constants.ts";

describe("serializeLogjarArg", () => {
  it("keeps strings and stringifies primitives", () => {
    expect(serializeLogjarArg("hello")).toBe("hello");
    expect(serializeLogjarArg(42)).toBe("42");
    expect(serializeLogjarArg(10n)).toBe("10");
    expect(serializeLogjarArg(false)).toBe("false");
    expect(serializeLogjarArg(undefined)).toBe("undefined");
    expect(serializeLogjarArg(null)).toBe("null");
    expect(serializeLogjarArg(Symbol("tag"))).toBe("Symbol(tag)");
  });

  it("summarizes errors and functions", () => {
    expect(serializeLogjarArg(new TypeError("boom"))).toBe("TypeError: boom");
    expect(serializeLogjarArg(function load() {})).toBe("[Function load]");
    expect(serializeLogjarArg(() => {})).toBe("[Function anonymous]");
  });

  it("serializes objects as JSON and survives circular references", () => {
    expect(serializeLogjarArg({ key: "val" })).toBe('{"key":"val"}');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeLogjarArg(circular)).toBe("[object Object]");
  });
});

describe("createLogBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers queued entries in one batch after the interval", () => {
    const batches: LogjarFrontendEntry[][] = [];
    const batcher = createLogBatcher({
      app: "web",
      batchInterval: 100,
      transport: (batch) => void batches.push(batch),
    });

    batcher.enqueue("log", ["one", 2]);
    batcher.enqueue("warn", ["three"], { pageHost: "localhost:5173" });
    expect(batches).toHaveLength(0);

    vi.advanceTimersByTime(100);
    expect(batches).toEqual([
      [
        { level: "log", args: ["one", "2"], app: "web", sourceKind: undefined },
        {
          level: "warn",
          args: ["three"],
          app: "web",
          sourceKind: undefined,
          pageHost: "localhost:5173",
        },
      ],
    ]);
  });

  it("lets an entry override the app name", () => {
    const batches: LogjarFrontendEntry[][] = [];
    const batcher = createLogBatcher({ transport: (batch) => void batches.push(batch) });

    batcher.enqueue("log", ["hi"], { app: "admin" });
    batcher.flush();
    expect(batches[0][0].app).toBe("admin");
  });

  it("cancels the pending timer on a manual flush", () => {
    const transport = vi.fn();
    const batcher = createLogBatcher({ batchInterval: 100, transport });

    batcher.enqueue("log", ["first"]);
    batcher.flush();
    expect(transport).toHaveBeenCalledTimes(1);

    // The next entry gets a full interval of its own.
    vi.advanceTimersByTime(60);
    batcher.enqueue("log", ["second"]);
    vi.advanceTimersByTime(60);
    expect(transport).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(40);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("swallows transport failures", async () => {
    const batcher = createLogBatcher({
      transport: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("sync failure");
        })
        .mockRejectedValueOnce(new Error("async failure")),
    });

    batcher.enqueue("log", ["a"]);
    expect(() => batcher.flush()).not.toThrow();
    batcher.enqueue("log", ["b"]);
    expect(() => batcher.flush()).not.toThrow();
    await vi.runAllTimersAsync();
  });
});

describe("formatUncaughtError", () => {
  const location = { filename: "http://localhost:5173/main.js", lineno: 7, colno: 28 };

  it("does not repeat the prefix Chrome already adds", () => {
    expect(
      formatUncaughtError({ message: "Uncaught TypeError: x is not a function", ...location }),
    ).toBe("Uncaught TypeError: x is not a function at http://localhost:5173/main.js:7:28");
  });

  it("adds the prefix for browsers that leave it out", () => {
    expect(formatUncaughtError({ message: "TypeError: x is not a function", ...location })).toBe(
      "Uncaught TypeError: x is not a function at http://localhost:5173/main.js:7:28",
    );
  });

  it("omits the location when the browser hides it", () => {
    expect(
      formatUncaughtError({ message: "Script error.", filename: "", lineno: 0, colno: 0 }),
    ).toBe("Uncaught Script error.");
    expect(formatUncaughtError({})).toBe("Uncaught Error");
  });
});
