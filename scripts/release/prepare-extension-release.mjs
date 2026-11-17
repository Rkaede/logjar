// Keeps the extension's version in step with the CLI's.
//
//   --write  Copies the version in apps/extension/package.json into the
//            manifest. `vp run release` runs this after bumpp bumps both
//            packages.
//   vX.Y.Z   Fails unless the CLI package, the extension package and the
//            manifest all match the release tag. The release workflow runs this.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { format } from "vite-plus/fmt";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

const cliPackagePath = path.join(rootDir, "apps", "cli", "package.json");
const extensionPackagePath = path.join(rootDir, "apps", "extension", "package.json");
const extensionManifestPath = path.join(rootDir, "apps", "extension", "src", "manifest.json");

const [arg] = process.argv.slice(2);

if (arg === "--write") {
  await writeManifestVersion();
} else {
  verifyReleaseTag(arg);
}

async function writeManifestVersion() {
  const { version } = readJson(extensionPackagePath);
  const manifest = readJson(extensionManifestPath);
  const expected = manifestVersionFields(version);

  manifest.version = expected.version;
  if (expected.version_name) {
    manifest.version_name = expected.version_name;
  } else {
    delete manifest.version_name;
  }

  // Formatted the way `vp check` expects, so the release commit passes it.
  const { code } = await format(extensionManifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(extensionManifestPath, code);
  console.log(`Synced the extension manifest to ${version}.`);
}

function verifyReleaseTag(releaseTag) {
  if (!releaseTag) {
    throw new Error("Expected --write or a release tag argument like v1.2.3.");
  }

  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(releaseTag)) {
    throw new Error(`Release tag "${releaseTag}" must use the form vX.Y.Z.`);
  }

  const version = releaseTag.slice(1);
  const manifest = readJson(extensionManifestPath);
  const expectedManifest = manifestVersionFields(version);
  const checks = [
    ["apps/cli/package.json version", readJson(cliPackagePath).version, version],
    ["apps/extension/package.json version", readJson(extensionPackagePath).version, version],
    ["apps/extension/src/manifest.json version", manifest.version, expectedManifest.version],
    [
      "apps/extension/src/manifest.json version_name",
      manifest.version_name,
      expectedManifest.version_name,
    ],
  ];

  const mismatches = checks.filter(([, actual, expected]) => actual !== expected);
  if (mismatches.length > 0) {
    for (const [field, actual, expected] of mismatches) {
      console.error(`${field} is ${actual ?? "absent"}, expected ${expected ?? "absent"}.`);
    }
    console.error(`Release tag ${releaseTag} does not match the committed versions.`);
    console.error("Bump them with `vp run release` before tagging.");
    process.exit(1);
  }

  console.log(`Validated ${releaseTag} against the CLI and extension versions.`);
}

// Chrome accepts only dot-separated integers in "version", so a prerelease
// such as 1.2.3-pre.1 keeps its full form in "version_name".
function manifestVersionFields(version) {
  const numericVersion = version.replace(/[-+].*$/, "");
  return {
    version: numericVersion,
    version_name: numericVersion === version ? undefined : version,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
