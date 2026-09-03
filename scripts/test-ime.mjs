// 输入法引擎测试：26键拼音 / 双拼 / 五笔 / 英文（9键引擎见 test-t9.mjs）。
// 引擎只依赖 ImeBar 的方法接口，用 mock 对象即可在 Node 中测试。
import { createImeEngine, SPECIAL } from '../src/ime/engines.js';
import { getCandidates } from '../src/ime/candidates.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, label) {
  if (!condition) throw new Error(`${label} 不通过`);
  console.log(`${label}：true`);
}

// ImeBar 的最小 mock
function mockBar() {
  return {
    composition: '',
    candidateList: [],
    committed: '',
    get candidates() {
      return this.candidateList;
    },
    setComposition(text) {
      this.composition = text;
    },
    showCandidates(list) {
      this.candidateList = list;
    },
    clearCandidates() {
      this.candidateList = [];
    },
    reset() {
      this.composition = '';
      this.candidateList = [];
    },
    commit(text) {
      this.committed += text;
    },
    backspaceOutput() {
      this.committed = this.committed.slice(0, -1);
    },
    clearOutput() {
      this.committed = '';
    },
  };
}

const shuangpinProfile = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'configs', 'ime', 'shuangpin.json'), 'utf8'),
);

// ---------- 26键拼音 ----------
{
  const bar = mockBar();
  const ime = createImeEngine({ engine: 'pinyin26' }, bar);

  ime.receive('n');
  ime.receive('i');
  assert(bar.composition === 'ni', '26键：字母累积为拼音 ni');
  assert(bar.candidates.length > 0, '26键：ni 有候选');
  ime.choose(bar.candidates[0]);
  assert(bar.committed === bar.candidates?.[0] || bar.committed.length === 1, '26键：选字上屏');
  assert(bar.composition === '' && bar.candidates.length === 0, '26键：选字后清空组词');

  // 退格：先删缓冲字母
  ime.receive('b');
  ime.receive(SPECIAL.BACKSPACE);
  assert(bar.composition === '', '26键：退格删除缓冲字母');

  // 空格：无候选时直接上屏空格
  const before = bar.committed;
  ime.receive(SPECIAL.SPACE);
  assert(bar.committed === `${before} `, '26键：无候选时空格直接上屏');
}

// ---------- 双拼（小鹤） ----------
{
  const bar = mockBar();
  const ime = createImeEngine(shuangpinProfile, bar);

  ime.receive('n');
  ime.receive('i');
  assert(bar.composition.includes('ni'), '双拼：n+i 解码为音节 ni');
  assert(bar.candidates.length > 0, '双拼：ni 有候选');

  ime.reset();
  ime.receive('h');
  ime.receive('c');
  assert(bar.composition.includes('hao'), '双拼：h+c 解码为音节 hao');

  ime.reset();
  ime.receive('v');
  ime.receive('d');
  assert(bar.composition.includes('zhai'), '双拼：v(zh)+d(ai) 解码为 zhai');

  ime.reset();
  ime.receive('a');
  ime.receive('h');
  assert(bar.composition.includes('ang'), '双拼：零声母 a+h 解码为 ang');
}

// ---------- 五笔（预留引擎） ----------
{
  const bar = mockBar();
  const ime = createImeEngine({ engine: 'wubi' }, bar);
  ime.receive('w');
  ime.receive('q');
  assert(bar.composition.includes('wq') && bar.composition.includes('预留'), '五笔：只记录输入并提示预留');
  assert(bar.candidates.length === 0, '五笔：无候选');
}

// ---------- 英文 ----------
{
  const bar = mockBar();
  const ime = createImeEngine({ engine: 'english' }, bar);
  ime.receive('h');
  ime.receive('i');
  assert(bar.committed === 'hi', '英文：字母直接上屏');
  ime.receive(SPECIAL.BACKSPACE);
  assert(bar.committed === 'h', '英文：退格删除已上屏字符');
}

// ---------- 九键拼音（字母组 → 数字键 → 九键候选） ----------
{
  const bar = mockBar();
  const ime = createImeEngine({ engine: 'ninekey' }, bar, {
    t9Dict: { ni: ['你', '泥'], hao: ['好'], li: ['里'] },
  });
  // 扭出字母组 abc → 数字 2，def → 数字 3 ...
  ime.receive('abc');
  ime.receive('def');
  // 23 → 可切分为 "de"? 无；这里用 ni=64 验证：jkl(5) 不对，ni 的键是 6,4 → mno? no.
  // n=6(mno), i=4(ghi) → 组 mno + ghi
  ime.reset();
  ime.receive('mno'); // 6
  ime.receive('ghi'); // 4 → 64 → ni
  assert(bar.composition.includes('ni'), '九键：mno+ghi 切分为 ni');
  assert(bar.candidateList.includes('你'), '九键：ni 候选含你');
  ime.choose('你');
  assert(bar.committed === '你', '九键：选字上屏');
  assert(bar.composition === '', '九键：选字后清空');
}

// ---------- 候选表 ----------
assert(Array.isArray(getCandidates('a')) && getCandidates('a').length > 0, '拼音候选表可返回候选');

console.log('输入法引擎测试通过');
