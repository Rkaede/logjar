import { describe, expect, it } from "vite-plus/test";
import { buildChildEnv, formatOutputLine } from "../src/cli/child.ts";

describe("buildChildEnv", () => {
  it("tells the command where the log server is", () => {
    const env = buildChildEnv({ PATH: "/bin" }, 9000, false);
    expect(env).toEqual({
      PATH: "/bin",
      LOGJAR_PORT: "9000",
      LOGJAR_URL: "http://localhost:9000",
    });
  });

  it("forces colour when logjar writes to a terminal", () => {
    expect(buildChildEnv({}, 9000, true).FORCE_COLOR).toBe("1");
  });

  it("leaves colour alone when logjar's output is not a terminal", () => {
    expect(buildChildEnv({}, 9000, false)).not.toHaveProperty("FORCE_COLOR");
  });

  it("respects a colour choice the user already made", () => {
    expect(buildChildEnv({ FORCE_COLOR: "0" }, 9000, true).FORCE_COLOR).toBe("0");

    const noColor = buildChildEnv({ NO_COLOR: "1" }, 9000, true);
    expect(noColor).not.toHaveProperty("FORCE_COLOR");
    expect(noColor.NO_COLOR).toBe("1");
  });
});

describe("formatOutputLine", () => {
  it("labels stdout and stderr lines", () => {
    expect(formatOutputLine("stdout", "ready")).toMatch(/^\[.+\] \[BE\] \[INFO\] ready$/);
    expect(formatOutputLine("stderr", "oops")).toMatch(/^\[.+\] \[BE\] \[ERROR\] oops$/);
  });

  it("removes colour codes", () => {
    expect(formatOutputLine("stdout", "\x1b[32m✓\x1b[39m built in \x1b[1m5ms\x1b[22m")).toMatch(
      /\] ✓ built in 5ms$/,
    );
  });

  it("skips lines that are empty without their colour codes", () => {
    expect(formatOutputLine("stdout", "")).toBeUndefined();
    expect(formatOutputLine("stdout", "\x1b[2K\x1b[0m")).toBeUndefined();
  });
});
