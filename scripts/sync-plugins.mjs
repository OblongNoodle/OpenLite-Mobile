// Copies the PC client's plugins into web/src/plugins for the mobile build,
// and its login helper (saved accounts) into web/src/helpers.
//   node scripts/sync-plugins.mjs [pc-client-dir]
// With a directory (CI's checkout of OpenLite's mobile branch), from its
// files. Without one, from the "mobile" branch of the local PC client
// (D:\Projects\HighLite-Client), not its working copy: the phone only gets
// PC changes that have been put on that branch on purpose. Plugins that
// don't work on a phone are left out (EXCLUDED).
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// Plugin files (top level of plugins/) not built into the phone app.
const EXCLUDED = new Set([
  "Highlite_SpellSound.js" // 81 MB of embedded audio
]);
const LOCAL_PC_CLIENT = "D:/Projects/HighLite-Client";
const PC_BRANCH = "mobile";
const PATHS = ["src/renderer/client/plugins", "src/renderer/client/helpers"];

let pc = process.argv[2] ?? process.env.OPENLITE_PC;
let extracted = null;
if (pc) {
  pc = resolve(pc);
} else {
  extracted = mkdtempSync(join(tmpdir(), "openlite-pc-"));
  execSync(`git -C "${LOCAL_PC_CLIENT}" archive --format=tar ${PC_BRANCH} ${PATHS.join(" ")} | tar -x -C "${extracted}"`, { stdio: "inherit" });
  pc = extracted;
}
const source = join(pc, "src/renderer/client/plugins");
const target = resolve(import.meta.dirname, "../web/src/plugins");
if (!existsSync(source)) throw new Error(`No PC client plugins at ${source}`);
rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter: (path) => !(EXCLUDED.has(basename(path)) && resolve(path, "..") === source)
});
cpSync(join(pc, "src/renderer/client/helpers/userHelper.js"), resolve(import.meta.dirname, "../web/src/helpers/userHelper.js"));
console.log(`Synced plugins and login helper from ${extracted ? `${LOCAL_PC_CLIENT} (${PC_BRANCH} branch)` : pc}`);
if (extracted) rmSync(extracted, { recursive: true, force: true });
