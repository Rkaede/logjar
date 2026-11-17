import { describe, expect, it } from "vite-plus/test";
import { parseArgs, UsageError } from "../src/cli/args.ts";

describe("parseArgs", () => {
  it("uses the defaults when only a command is given", () => {
    expect(parseArgs(["--", "npm", "run", "dev"], {})).toEqual({
      port: 8797,
      logFile: ".logjar/logs.txt",
      maxAgeMs: 900_000,
      maxSizeBytes: 200 * 1024,
      command: ["npm", "run", "dev"],
    });
  });

  it("reads options given before the command", () => {
    const argv = ["--port", "9000", "--out=logs/dev.txt", "--max-age", "60", "--max-size", "1.5"];
    expect(parseArgs([...argv, "--", "next", "dev"])).toEqual({
      port: 9000,
      logFile: "logs/dev.txt",
      maxAgeMs: 60_000,
      maxSizeBytes: 1536,
      command: ["next", "dev"],
    });
  });

  it("leaves the command's own flags alone", () => {
    const parsed = parseArgs(["--", "next", "dev", "--port", "3000"], {});
    expect(parsed).toMatchObject({ port: 8797, command: ["next", "dev", "--port", "3000"] });
  });

  it("accepts a command without the -- separator", () => {
    const parsed = parseArgs(["--port", "9000", "npm", "run", "dev", "--port", "3000"]);
    expect(parsed).toMatchObject({ port: 9000, command: ["npm", "run", "dev", "--port", "3000"] });
  });

  it("returns help for -h and --help", () => {
    expect(parseArgs(["--help"])).toBe("help");
    expect(parseArgs(["--port", "9000", "-h"])).toBe("help");
  });

  it("rejects a missing command, unknown options and missing values", () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(["--port", "9000"])).toThrow("Missing command");
    expect(() => parseArgs(["--verbose", "--", "npm"])).toThrow("Unknown option: --verbose");
    expect(() => parseArgs(["--port", "--", "npm"])).toThrow("Missing value for --port");
  });

  it("takes the port from LOGJAR_PORT unless --port is given", () => {
    const environment = { LOGJAR_PORT: "9200" };
    expect(parseArgs(["--", "npm"], environment)).toMatchObject({ port: 9200 });
    expect(parseArgs(["--port", "9100", "--", "npm"], environment)).toMatchObject({ port: 9100 });
    // A --port that belongs to the command is not logjar's.
    expect(parseArgs(["--", "next", "dev", "--port", "3000"], environment)).toMatchObject({
      port: 9200,
    });
  });

  it("accepts port 0 for a port chosen by the operating system", () => {
    expect(parseArgs(["--port", "0", "--", "npm"], {})).toMatchObject({ port: 0 });
  });

  it("rejects values that are out of range", () => {
    for (const port of ["-1", "65536", "80.5", "abc", ""]) {
      expect(() => parseArgs([`--port=${port}`, "--", "npm"], {})).toThrow(
        "Invalid value for --port",
      );
    }
    expect(() => parseArgs(["--", "npm"], { LOGJAR_PORT: "nope" })).toThrow(UsageError);
    expect(() => parseArgs(["--max-age", "0", "--", "npm"])).toThrow("Invalid value for --max-age");
    expect(() => parseArgs(["--max-size=-1", "--", "npm"])).toThrow("Invalid value for --max-size");
  });
});
