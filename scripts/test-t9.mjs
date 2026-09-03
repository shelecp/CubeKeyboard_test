// 九键拼音引擎测试：数字切分、候选、选字消费、退格、标点、真实字库完整性。
import { createT9Engine, syllableToDigits, KEY_LETTERS, PUNCTUATION } from '../src/ime/t9Engine.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, label) {
  if (!condition) throw new Error(`${label} 不通过`);
  console.log(`${label}：true`);
}

// ---------- 用迷你字典验证逻辑 ----------
const miniDict = {
  ni: ['你', '泥'],
  li: ['里', '力'],
  a: ['啊'],
  ai: ['爱'],
  an: ['安'],
  ang: ['昂'],
  hao: ['好'],
};

const engine = createT9Engine(miniDict);

// n=6, i=4 → "ni"
engine.press('6');
engine.press('4');
assert(engine.composition().includes('ni'), '6+4 切分为 ni');
assert(engine.candidates()[0] === '你', 'ni 的首选候选是你');

// 选字消费对应数字
engine.choose('你');
assert(engine.bufferText() === '', '选字后数字缓冲清空');

// "hao" = 4 2 6：h/a 不单独成音节，只有唯一切分
engine.clear();
engine.press('4');
engine.press('2');
engine.press('6');
assert(engine.composition().includes('hao'), '426 切分为 hao');
assert(!engine.composition().includes('切分'), '426 只有唯一切分');

// 前缀歧义："an" 是 "ang" 的前缀码？2=abc→26 是 an；264 是 ang。4 单独不是音节，无歧义。
engine.clear();
engine.press('2');
engine.press('6');
assert(engine.candidates().includes('安'), '26 切分为 an，候选含安');

// 标点
engine.clear();
engine.press('1');
assert(engine.candidates().join('') === PUNCTUATION.join(''), '数字 1 给出标点候选');
engine.choose('。');
assert(engine.bufferText() === '', '选标点后清空');

// 退格
engine.clear();
engine.press('5');
engine.press('4');
engine.backspace();
assert(engine.bufferText() === '5', '退格删除一位数字');
engine.backspace();
assert(engine.bufferText() === '' && engine.composition() === '', '缓冲清空后组词预览为空');

// 超长缓冲上限
engine.clear();
for (let i = 0; i < 20; i += 1) engine.press('9');
assert(engine.bufferText().length === 12, '数字缓冲有上限（12 位）');

// 键位映射抽查
assert(syllableToDigits('zhuang') === '948264', 'zhuang → 948264');
assert(KEY_LETTERS[7] === 'pqrs', '7 键含 pqrs');

// ---------- 真实字库完整性 ----------
const realDict = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ime', 't9-dict.json'), 'utf8'),
).syllables;

const keys = Object.keys(realDict);
assert(keys.length >= 380, `真实字库音节数充足（${keys.length}）`);
assert(keys.every((key) => /^[a-z]{1,6}$/.test(key)), '真实字库音节全部合法');
assert(realDict.de?.includes('的') && realDict.shi?.includes('是'), '真实字库高频字正确（的/是）');
assert(realDict.lv?.includes('律') || realDict.lv?.includes('旅'), '真实字库含 lv（ü→v）');

const realEngine = createT9Engine(realDict);
// "9426" 同时可切分为 xian 和 zhao（T9 固有歧义）：两种切分的候选都应出现在前列
realEngine.press('9');
realEngine.press('4');
realEngine.press('2');
realEngine.press('6');
assert(realEngine.composition().startsWith('9426 → '), '真实字库：9426 显示切分预览');
const topCandidates = realEngine.candidates().slice(0, 12);
const hasZhao = topCandidates.some((char) => ['着', '照', '找'].includes(char));
const hasXian = topCandidates.some((char) => ['现', '先'].includes(char));
assert(hasZhao && hasXian, '真实字库：多切分候选轮询合并（zhao/xian 都在前列）');

console.log('九键引擎测试通过');
