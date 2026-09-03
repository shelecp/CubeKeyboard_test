// 一次性：用 t9 字库（Jun Da 字频）补齐 src/ime/candidates.js 缺失的音节条目。
// 用法：node scripts/patch-candidates.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidatesPath = join(root, 'src', 'ime', 'candidates.js');
const t9Dict = JSON.parse(readFileSync(join(root, 'src', 't9', 't9-dict.json'), 'utf8')).syllables;

const source = readFileSync(candidatesPath, 'utf8');
const existing = new Set();
const keyRegex = /^\s{2}([a-z]{1,6}):\s*\[/gm;
let match;
while ((match = keyRegex.exec(source)) !== null) existing.add(match[1]);

const additions = [];
for (const [syllable, chars] of Object.entries(t9Dict)) {
  if (existing.has(syllable)) continue;
  additions.push(`  ${syllable}: [${chars.slice(0, 6).map((c) => `'${c}'`).join(', ')}],`);
}

if (additions.length === 0) {
  console.log('候选表无缺失音节，无需补丁。');
  process.exit(0);
}

const updated = source.replace(/\n\};/, `\n${additions.join('\n')}\n};`);
writeFileSync(candidatesPath, updated, 'utf8');
console.log(`已补充 ${additions.length} 个音节：${additions.map((line) => line.trim().split(':')[0]).join(' ')}`);
