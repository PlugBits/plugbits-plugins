import { mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";

const [,, dir, displayName="My Plugin"] = process.argv;
if (!dir) { console.error("Usage: npm run create:plugin <dir> [Display Name]"); process.exit(1); }

const src = join("plugins", "_template");
const dst = join("plugins", dir);
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });

const mfPath = join(dst, "manifest.json");
const mf = JSON.parse(readFileSync(mfPath, "utf8"));
mf.name.ja = displayName; mf.name.en = displayName; mf.icon = "icon.png";
writeFileSync(mfPath, JSON.stringify(mf, null, 2));

const pkgPath = join(dst, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = dir;
pkg.scripts.pack = pkg.scripts.pack.replace(/my-plugin\.zip/, `${dir}.zip`);
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log(`✔ Created plugins/${dir}`);
