// esbuild.config.mjs
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const entries = {
  'dist/js/plugin.js': 'src/js/plugin.js',
  'dist/js/config.js': 'src/js/config.js'
};

for (const [outfile, entry] of Object.entries(entries)) {
  await build({ entryPoints:[entry], outfile, bundle:true, minify:true, target:['es2019'], format:'iife' });
}

// ここから追記：静的ファイルを dist へ
mkdirSync('dist', { recursive: true });
cpSync('src/css', 'dist/css', { recursive:true });
cpSync('src/html','dist/html',{ recursive:true });
cpSync('src/images','dist/images',{ recursive:true });



// manifest を dist 用に書き換えて出力
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.icon = 'images/icon_128.png';
manifest.desktop = { js: ['js/plugin.js'], css: ['css/base.css','css/plugin.css'] };
manifest.config  = { html: 'html/config.html', js: ['js/config.js'], css: ['css/config.css'] };
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));

console.log('✅ build finished (with static copy)');
