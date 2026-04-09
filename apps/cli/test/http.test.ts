import { describe, expect, it } from "vite-plus/test";
import { formatFrontendEntries, isTrustedOriginHeader } from "../src/server/http.ts";

describe("formatFrontendEntries", () => {
  it("formats single payloads with extension metadata", () => {
    const [line] = formatFrontendEntries({
      level: "warn",
      args: ["failed"],
      sourceKind: "extension",
      pageHost: "localhost:5173",
    });

    expect(line).toMatch(/\[FE:ext\] \[WARN\] failed \(host=localhost:5173\)$/);
  });

  it("formats batches and preserves app labels", () => {
    const lines = formatFrontendEntries([
      { level: "info", args: ["ok"], app: "web" },
      { level: "error", args: ["boom"], app: "admin" },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\[FE:web\] \[INFO\] ok$/);
    expect(lines[1]).toMatch(/\[FE:admin\] \[ERROR\] boom$/);
  });
});

describe("isTrustedOriginHeader", () => {
  it("allows requests without an origin header", () => {
    expect(isTrustedOriginHeader()).toBe(true);
  });

  it("allows loopback browser origins", () => {
    expect(isTrustedOriginHeader("http://localhost:5173")).toBe(true);
    expect(isTrustedOriginHeader("https://127.0.0.1:3000")).toBe(true);
    expect(isTrustedOriginHeader("http://app.localhost:4173")).toBe(true);
    expect(isTrustedOriginHeader("chrome-extension://abcdefghijklmnop")).toBe(true);
  });

  it("rejects non-loopback origins", () => {
    expect(isTrustedOriginHeader("https://example.com")).toBe(false);
    expect(isTrustedOriginHeader("notaurl")).toBe(false);
  });
});
