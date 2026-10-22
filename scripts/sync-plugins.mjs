// Copies the PC client's plugins into web/src/plugins for the mobile build,
// and its login helper (saved accounts) into web/src/helpers.
//   node scripts/sync-plugins.mjs [pc-client-dir]
// The PC client is D:\Projects\HighLite-Client locally (OpenLite on GitHub
// in CI). Plugins that don't work on a phone are left out (EXCLUDED).
import { cpSync, existsSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// Plugin files (top level of plugins/) not built into the phone app.
const EXCLUDED = new Set([
  "Highlite_SpellSound.js" // 81 MB of embedded audio
]);

const pc = resolve(process.argv[2] ?? process.env.OPENLITE_PC ?? "D:/Projects/HighLite-Client");
const source = join(pc, "src/renderer/client/plugins");
const target = resolve(import.meta.dirname, "../web/src/plugins");
if (!existsSync(source)) throw new Error(`No PC client plugins at ${source}`);
rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter: (path) => !(EXCLUDED.has(basename(path)) && resolve(path, "..") === source)
});
cpSync(join(pc, "src/renderer/client/helpers/userHelper.js"), resolve(import.meta.dirname, "../web/src/helpers/userHelper.js"));
console.log(`Synced plugins and login helper from ${pc}`);
