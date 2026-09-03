// 生成 src/t9/t9-dict.json：九键拼音的"音节 → 常用字（按字频排序）"词典。
// 数据来源：
// 1. Jun Da《现代汉语单字频率列表》(Modern Chinese Character Frequency List,
//    https://lingua.mtsu.edu/chinese-computing/statistics/)，本地副本 scripts/data/charfreq-ModernMO.txt
// 2. 拼音取字频表自带的多音标注，去掉声调数字；ü 按输入法惯例写作 v。
// 重新生成：node scripts/gen-t9-dict.mjs（无本地副本时需要网络下载字频表）
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(root, 'scripts', 'data', 'charfreq-ModernMO.txt');
const outPath = join(root, 'src', 't9', 't9-dict.json');
const MAX_CHARS = 5000;   // 取字频前 5000 字
const MAX_PER_SYLLABLE = 40;

if (!existsSync(dataPath)) {
  console.error('缺少字频表副本 scripts/data/charfreq-ModernMO.txt，请先从 https://lingua.mtsu.edu/chinese-computing/statistics/ 下载。');
  process.exit(1);
}

const lines = readFileSync(dataPath, 'utf8').split(/\r?\n/);
const syllables = Object.create(null);
let charCount = 0;

for (const line of lines) {
  if (!line || line.startsWith('/*')) continue;
  const cols = line.split('\t');
  if (cols.length < 5) continue;
  if (Number(cols[0]) > MAX_CHARS) break;

  const char = cols[1];
  const pinyinField = cols[4];
  for (const rawToken of pinyinField.split('/')) {
    const syllable = rawToken.trim().toLowerCase().replace(/[0-9]/g, '').replace(/ü/g, 'v');
    // 过滤非音节（无元音的注音碎片等；v 是 ü 的输入法惯例写法，视为元音）
    if (!/^[a-z]{1,6}$/.test(syllable)) continue;
    if (!/[aeiouv]/.test(syllable)) continue;
    const bucket = (syllables[syllable] ||= []);
    if (bucket.length >= MAX_PER_SYLLABLE) continue;
    if (!bucket.includes(char)) bucket.push(char);
  }
  charCount += 1;
}

const syllableCount = Object.keys(syllables).length;
const output = {
  version: 1,
  source: 'Jun Da Modern Chinese Character Frequency List（去声调，ü→v，取前 5000 高频字）',
  syllables,
};
writeFileSync(outPath, JSON.stringify(output), 'utf8');

const sizeKB = Math.round(Buffer.byteLength(JSON.stringify(output)) / 1024);
console.log(`已生成 ${outPath}`);
console.log(`音节数：${syllableCount}，收录字数：约 ${charCount}，文件大小：约 ${sizeKB} KB`);
