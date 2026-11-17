import { describe, expect, it, vi } from "vite-plus/test";
import { patchMethod } from "../src/shared/patch.ts";

function createTarget() {
  const native = (value: string) => `native ${value}`;
  return { native, target: { run: native } };
}

describe("patchMethod", () => {
  it("wraps the method and restores the original", () => {
    const { native, target } = createTarget();
    const seen: string[] = [];
    const patch = patchMethod(target, "run", (original) => (value) => {
      seen.push(value);
      return original(value);
    });

    patch.install();
    expect(target.run("a")).toBe("native a");
    expect(seen).toEqual(["a"]);

    patch.uninstall();
    expect(target.run).toBe(native);
  });

  it("leaves a method that was wrapped again since, and reuses its wrapper", () => {
    const { target } = createTarget();
    const wrap = vi.fn((original: (value: string) => string) => original);
    const patch = patchMethod(target, "run", (original) => wrap((value) => original(value)));

    patch.install();
    const ours = target.run;
    const theirs = (value: string) => `theirs ${ours(value)}`;
    target.run = theirs;

    patch.uninstall();
    expect(target.run).toBe(theirs);

    patch.install();
    expect(target.run).toBe(theirs);
    expect(wrap).toHaveBeenCalledTimes(1);
  });

  it("wraps whatever is in place when installed again", () => {
    const { target } = createTarget();
    const patch = patchMethod(target, "run", (original) => (value) => `ours ${original(value)}`);

    patch.install();
    patch.uninstall();
    target.run = (value) => `replaced ${value}`;

    patch.install();
    expect(target.run("a")).toBe("ours replaced a");
  });
});
