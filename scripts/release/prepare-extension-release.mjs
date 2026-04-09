import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

const cliPackagePath = path.join(rootDir, "apps", "cli", "package.json");
const extensionPackagePath = path.join(rootDir, "apps", "extension", "package.json");
const extensionManifestPath = path.join(rootDir, "apps", "extension", "src", "manifest.json");

const [releaseTag, mode] = process.argv.slice(2);

if (!releaseTag) {
  throw new Error("Expected a release tag argument like v1.2.3.");
}

if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(releaseTag)) {
  throw new Error(`Release tag "${releaseTag}" must use the form vX.Y.Z.`);
}

const releaseVersion = releaseTag.slice(1);
const cliPackage = JSON.parse(fs.readFileSync(cliPackagePath, "utf8"));

if (cliPackage.version !== releaseVersion) {
  throw new Error(
    `Release tag ${releaseTag} does not match apps/cli/package.json version ${cliPackage.version}.`,
  );
}

console.log(`Validated ${releaseTag} against apps/cli/package.json.`);

if (mode !== "--write") {
  process.exit(0);
}

const extensionPackage = JSON.parse(fs.readFileSync(extensionPackagePath, "utf8"));
const extensionManifest = JSON.parse(fs.readFileSync(extensionManifestPath, "utf8"));

extensionPackage.version = releaseVersion;
extensionManifest.version = releaseVersion;

fs.writeFileSync(extensionPackagePath, `${JSON.stringify(extensionPackage, null, 2)}\n`);
fs.writeFileSync(extensionManifestPath, `${JSON.stringify(extensionManifest, null, 2)}\n`);

console.log(`Synced extension package and manifest to ${releaseVersion}.`);
