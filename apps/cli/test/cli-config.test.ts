import { spawnSync } from "node:child_process";
import process from "node:process";
import { describe, expect, it } from "vite-plus/test";
import { createChildEnvironment, resolveConfiguredPort } from "../src/cli/config.ts";
import { DEFAULT_PORT } from "../src/shared/constants.ts";

describe("resolveConfiguredPort", () => {
  it("prefers --port over LOGJAR_PORT", () => {
    expect(resolveConfiguredPort(["--port", "9100", "--", "dev"], { LOGJAR_PORT: "9200" })).toBe(
      9100,
    );
  });

  it("uses LOGJAR_PORT when --port is absent", () => {
    expect(resolveConfiguredPort(["--", "dev"], { LOGJAR_PORT: "9200" })).toBe(9200);
  });

  it("preserves the existing default when neither source is configured", () => {
    expect(resolveConfiguredPort(["--", "dev"], {})).toBe(DEFAULT_PORT);
  });

  it("accepts port 0 for OS-assigned ports", () => {
    expect(resolveConfiguredPort(["--port", "0"], { LOGJAR_PORT: "9200" })).toBe(0);
    expect(resolveConfiguredPort([], { LOGJAR_PORT: "0" })).toBe(0);
  });

  it.each(["not-a-port", "-1", "1.5", "65536"])("rejects invalid CLI port %s", (value) => {
    expect(() => resolveConfiguredPort(["--port", value], {})).toThrow(
      "[logjar] Invalid value for --port: must be an integer between 0 and 65535",
    );
  });

  it.each(["", "not-a-port", "-1", "1.5", "65536"])("rejects invalid LOGJAR_PORT %s", (value) => {
    expect(() => resolveConfiguredPort([], { LOGJAR_PORT: value })).toThrow(
      "[logjar] Invalid value for LOGJAR_PORT: must be an integer between 0 and 65535",
    );
  });
});

describe("createChildEnvironment", () => {
  it("propagates the actual listening port to a wrapped child", () => {
    const actualPort = 49_152;
    const environment = createChildEnvironment(
      { EXISTING_VALUE: "preserved", LOGJAR_PORT: "0" },
      actualPort,
    );
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        "process.stdout.write(JSON.stringify({ port: process.env.LOGJAR_PORT, url: process.env.LOGJAR_URL, existing: process.env.EXISTING_VALUE }))",
      ],
      { encoding: "utf8", env: environment },
    );

    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      port: String(actualPort),
      url: `http://localhost:${actualPort}`,
      existing: "preserved",
    });
  });
});
