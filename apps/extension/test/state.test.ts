import { describe, expect, it } from "vite-plus/test";
import {
  isTabEnabled,
  normalizePort,
  sanitizeEnabledTabs,
  setTabEnabled,
} from "../src/shared/state.ts";

describe("extension state helpers", () => {
  it("normalizes invalid ports back to the logjar default", () => {
    expect(normalizePort("nope")).toBe(8797);
    expect(normalizePort(0)).toBe(8797);
  });

  it("stores enabled tabs by numeric id", () => {
    const next = setTabEnabled({}, 42, true);
    expect(isTabEnabled(next, 42)).toBe(true);
  });

  it("removes disabled tabs", () => {
    const next = setTabEnabled({ "42": true }, 42, false);
    expect(isTabEnabled(next, 42)).toBe(false);
  });

  it("drops malformed stored values", () => {
    expect(
      sanitizeEnabledTabs({
        "10": true,
        abc: true,
        "11": false,
      }),
    ).toEqual({ "10": true });
  });
});
