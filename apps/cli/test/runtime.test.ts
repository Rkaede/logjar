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

  it("summarizes functions", () => {
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

describe("serializeLogjarArg with errors", () => {
  function errorWithStack(error: Error, stack: string | undefined): Error {
    error.stack = stack;
    return error;
  }

  const v8Frames = [1, 2, 3, 4, 5, 6, 7].map(
    (n) => `    at f${n} (http://localhost:5173/main.js:${n}:1)`,
  );

  it("adds the first five V8 frames without repeating the message", () => {
    const error = errorWithStack(
      new TypeError("boom"),
      ["TypeError: boom", ...v8Frames].join("\n"),
    );
    expect(serializeLogjarArg(error)).toBe(["TypeError: boom", ...v8Frames.slice(0, 5)].join("\n"));
  });

  it("works with a real V8 stack", () => {
    const [summary, ...frames] = serializeLogjarArg(new TypeError("boom")).split("\n");
    expect(summary).toBe("TypeError: boom");
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(5);
    expect(frames.every((frame) => frame.startsWith("    at "))).toBe(true);
  });

  it("keeps a multi-line message whole", () => {
    const error = errorWithStack(
      new Error("line 1\nline 2"),
      `Error: line 1\nline 2\n${v8Frames[0]}`,
    );
    expect(serializeLogjarArg(error)).toBe(`Error: line 1\nline 2\n${v8Frames[0]}`);
  });

  it("matches V8's summary for an error without a message", () => {
    const error = errorWithStack(new Error(""), `Error\n${v8Frames[0]}`);
    expect(serializeLogjarArg(error)).toBe(`Error\n${v8Frames[0]}`);
  });

  it("adds Firefox and Safari frames, which do not repeat the message", () => {
    const error = errorWithStack(
      new Error(""),
      "ErrorBoundary@http://localhost:5173/main.js:3:9\n@http://localhost:5173/main.js:9:1\n",
    );
    expect(serializeLogjarArg(error)).toBe(
      "Error\n    ErrorBoundary@http://localhost:5173/main.js:3:9\n    @http://localhost:5173/main.js:9:1",
    );
  });

  it("falls back to the summary when there is no stack", () => {
    expect(serializeLogjarArg(errorWithStack(new TypeError("boom"), undefined))).toBe(
      "TypeError: boom",
    );
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

  it("adds the stack frames of the thrown error", () => {
    const error = new TypeError("x is not a function");
    error.stack =
      "TypeError: x is not a function\n    at load (http://localhost:5173/main.js:7:28)";
    expect(
      formatUncaughtError({
        message: "Uncaught TypeError: x is not a function",
        ...location,
        error,
      }),
    ).toBe(
      "Uncaught TypeError: x is not a function at http://localhost:5173/main.js:7:28\n" +
        "    at load (http://localhost:5173/main.js:7:28)",
    );
  });

  it("omits the location when the browser hides it", () => {
    expect(
      formatUncaughtError({ message: "Script error.", filename: "", lineno: 0, colno: 0 }),
    ).toBe("Uncaught Script error.");
    expect(formatUncaughtError({})).toBe("Uncaught Error");
  });
});
