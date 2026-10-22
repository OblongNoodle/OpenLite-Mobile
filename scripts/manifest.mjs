// Writes manifest.json for a built bundle: what the app downloads to update
// itself (MainActivity.checkForUpdate).
//   node scripts/manifest.mjs <dist-dir> <version>
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const [, , dist, version] = process.argv;
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name !== "manifest.json") files.push(relative(dist, path).replaceAll("\\", "/"));
  }
};
walk(dist);
writeFileSync(join(dist, "manifest.json"), JSON.stringify({ version, files }, null, 2));
console.log(`manifest ${version}: ${files.length} files`);
