import { mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
let outFile = '';
let ppkFile = '';
const fallbackPpkFiles = [];
let pluginDir = '.';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--out') {
    outFile = args[i + 1] || '';
    i += 1;
    continue;
  }
  if (arg === '--ppk') {
    ppkFile = args[i + 1] || '';
    i += 1;
    continue;
  }
  if (arg === '--fallback-ppk') {
    fallbackPpkFiles.push(args[i + 1] || '');
    i += 1;
    continue;
  }
  pluginDir = arg;
}

if (!outFile) {
  fail('pack-plugin: --out is required.');
}

mkdirSync('.keys', { recursive: true });
mkdirSync('dist', { recursive: true });

let resolvedPpk = '';
if (ppkFile) {
  if (existsSync(ppkFile)) {
    resolvedPpk = ppkFile;
  } else {
    resolvedPpk = fallbackPpkFiles.find((candidate) => candidate && existsSync(candidate)) || '';
    if (!resolvedPpk) {
      fail(`pack-plugin: missing private key: ${ppkFile}`);
    }
  }
}

const packerEntryPath = require.resolve('@kintone/plugin-packer');
const cliPath = join(dirname(dirname(packerEntryPath)), 'bin', 'cli.js');
const packerArgs = [pluginDir, '--out', outFile];
if (resolvedPpk) {
  packerArgs.push('--ppk', resolvedPpk);
}

const result = spawnSync(process.execPath, [cliPath, ...packerArgs], {
  stdio: 'inherit',
  shell: false
});

if (result.error) {
  fail(`pack-plugin: ${result.error.message}`);
}

process.exit(result.status ?? 1);
