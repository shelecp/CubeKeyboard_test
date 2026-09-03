// 一次性生成 src/configs/ime/*.json 输入法配置文件。
// 规则表由 defaultConfig.buildAlphabetRules 派生（两段扭转 = 一个字母）；
// 九键拼音的规则表为"扭转 → 字母组"（abc/def/...，输出锁定不可改）。
// 后续手工编辑 JSON 即可自定义各输入法的映射表；本脚本仅在需要重置时重跑。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAlphabetRules } from '../src/mapping/defaultConfig.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'configs', 'ime');
mkdirSync(outDir, { recursive: true });

const alphabet = buildAlphabetRules();

// 九键拼音：单层扭转输出一个数字键的字母组（顺时针方向；逆时针可自行改表）。
// 输出组 abc/def/... 是九键布局的固有内容，配置里锁定不可修改，只能改前面的扭转层。
function buildNinekeyRules() {
  const groups = [
    ['abc', 'F'], ['def', 'B'], ['ghi', 'U'], ['jkl', 'D'],
    ['mno', 'L'], ['pqrs', 'R'], ['tuv', 'M'], ['wxyz', 'E'],
    ['标点', 'S'],
  ];
  return groups.map(([output, face]) => ({
    id: `ninekey-${output}`,
    type: 'turn-sequence',
    when: [face],
    output,
  }));
}

// 小鹤双拼键位表（来源 https://shuangpin.xyz/chart/xiaohe/）
// 声母只列特殊的 zh/ch/sh，其余声母按键本身处理；一键多韵取最常用项。
const xiaohe = {
  scheme: '小鹤双拼',
  initials: { v: 'zh', i: 'ch', u: 'sh' },
  finals: {
    q: 'iu', w: 'ei', r: 'uan', t: 'ue', y: 'un', o: 'uo', p: 'ie',
    s: 'ong', d: 'ai', f: 'en', g: 'eng', h: 'ang', j: 'an', k: 'ing',
    l: 'iang', z: 'ou', x: 'ia', c: 'ao', v: 'ui', b: 'in', n: 'iao', m: 'ian',
    a: 'a', e: 'e', i: 'i', u: 'u',
  },
  zeroInitial: {
    aa: 'a', oo: 'o', ee: 'e',
    ai: 'ai', an: 'an', en: 'en', ao: 'ao', ei: 'ei', ou: 'ou', er: 'er',
    ah: 'ang', eg: 'eng', os: 'ong',
  },
};

const profiles = [
  {
    id: 'pinyin26',
    name: '26键拼音',
    engine: 'pinyin26',
    enabled: true,
    description: '两段扭转拼出一个字母，字母累积成拼音后点选候选（或按数字键）上屏。',
    defaultRules: alphabet,
    config: {},
  },
  {
    id: 'ninekey',
    name: '九键拼音',
    engine: 'ninekey',
    enabled: true,
    // 输出组（abc/def/...）由九键布局决定，锁定不可修改；只能改每条规则的扭转层。
    lockOutput: true,
    description: '扭一层输出一个按键的字母组（如 abc），组字母累积成数字串后按九键拼音出候选。',
    defaultRules: buildNinekeyRules(),
    config: {},
  },
  {
    id: 'shuangpin',
    name: '双拼（小鹤）',
    engine: 'shuangpin',
    enabled: true,
    description: '两段扭转拼出一个字母，两键定一个音节（小鹤双拼方案，简版：一次一个音节）。',
    defaultRules: alphabet,
    config: xiaohe,
  },
  {
    id: 'wubi',
    name: '五笔（预留）',
    engine: 'wubi',
    enabled: true,
    description: '扭转规则表已生效；五笔字根-字词库与候选引擎为预留接口，后续接入。',
    defaultRules: alphabet,
    config: { version: '86', dict: null },
  },
  {
    id: 'english',
    name: '纯英文',
    engine: 'english',
    enabled: true,
    description: '扭转规则表输出的字母直接上屏，不做拼音组词。',
    defaultRules: alphabet,
    config: {},
  },
];

for (const profile of profiles) {
  const target = join(outDir, `${profile.id}.json`);
  writeFileSync(target, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${target}（${profile.defaultRules.length} 条默认规则）`);
}
