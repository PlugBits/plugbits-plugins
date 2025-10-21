// tools/kb-zip-verify.mjs  — nested zip対応版
import { globby } from "globby";
import AdmZip from "adm-zip";

let fail = false;
const err = (m)=>{ console.error("✖", m); fail = true; };
const ok  = (m)=>{ console.log("✔", m); };

const MANIFEST_RE = /(^|[\\/])manifest\.json$/i;
const normalize = (p) => p.replace(/\\/g, "/").replace(/\/\.\//g, "/").replace(/\/+/g, "/");

// ZIP内を再帰的に探索して manifest.json を探す
function findManifestInZip(zip) {
  const entries = zip.getEntries();
  // 1) 直下
  const direct = entries.find(e => MANIFEST_RE.test(e.entryName));
  if (direct) return { manifestEntry: direct, containerZip: zip };

  // 2) 直下に無ければ、内包ZIP（*.zip）を順に開いて探索
  for (const e of entries) {
    if (!/\.zip$/i.test(e.entryName)) continue;
    try {
      const innerZip = new AdmZip(e.getData());
      const hit = findManifestInZip(innerZip);
      if (hit) return hit;
    } catch { /* 壊れZIPはスキップ */ }
  }
  return null;
}

function listEntries(zip) {
  return zip.getEntries().map(e => normalize(e.entryName));
}

const zips = await globby([
  "plugins/*/dist/*.zip",
  "plugins/*/ship/*.zip" // まだ ship を使っている場合も拾う
]);

for (const zipPath of zips) {
  try {
    const zip = new AdmZip(zipPath);
    const found = findManifestInZip(zip);
    if (!found) {
      err(`${zipPath}: manifest.json なし（直下/ネスト内とも未検出）`);
      continue;
    }

    const { manifestEntry, containerZip } = found;
    const manifest = JSON.parse(containerZip.readAsText(manifestEntry));
    const base = normalize(manifestEntry.entryName.replace(/manifest\.json$/i, ""));
    const entries = listEntries(containerZip);

    for (const p of (manifest?.config?.css ?? [])) {
      const want1 = normalize(base + p); // manifest 基準の相対
      const want2 = normalize(p);        // ルート想定
      const hit = entries.includes(want1) || entries.includes(want2);
      if (!hit) err(`${zipPath}: ${p} がZIP内で見つかりません（探査: ${want1} / ${want2}）`);
      else ok(`${zipPath}: ${p} OK`);
    }
  } catch (e) {
    err(`${zipPath}: 解析時例外 -> ${e.message}`);
  }
}

process.exit(fail ? 1 : 0);
