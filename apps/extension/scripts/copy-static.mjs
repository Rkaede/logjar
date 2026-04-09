import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, "..");
const distDir = path.join(packageDir, "dist");

fs.mkdirSync(distDir, { recursive: true });
for (const file of ["manifest.json", "popup.html"]) {
  fs.copyFileSync(path.join(packageDir, "src", file), path.join(distDir, file));
}
