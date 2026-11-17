import { execFileSync } from "node:child_process";
import fs from "node:fs";
import url from "node:url";
import { describe, expect, it } from "vite-plus/test";

const script = url.fileURLToPath(
  new URL("../../../scripts/release/prepare-extension-release.mjs", import.meta.url),
);
const { version } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

function verify(tag: string): () => void {
  return () => execFileSync(process.execPath, [script, tag], { stdio: "pipe" });
}

describe("prepare-extension-release", () => {
  it("accepts a tag that matches the committed CLI and extension versions", () => {
    expect(verify(`v${version}`)).not.toThrow();
  });

  it("rejects a tag that does not match them", () => {
    expect(verify("v99.0.0")).toThrow(/does not match the committed versions/);
  });
});
