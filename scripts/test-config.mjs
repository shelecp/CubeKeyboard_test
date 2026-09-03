// 配置测试：v3 键位权威、无静默迁移、默认规则表前缀自由。
import { DEFAULT_CONFIG, buildAlphabetRules } from '../src/mapping/defaultConfig.js';
import { parseConfig } from '../src/mapping/config.js';

function assert(condition, label) {
  if (!condition) throw new Error(`${label} 不通过`);
  console.log(`${label}：true`);
}

// 1) 键位唯一权威：a/s/d/f/r/v 固定对应左/正/右/背/顶/底
const keymap = DEFAULT_CONFIG.keymap;
assert(
  keymap.a?.face === 'L'
    && keymap.s?.face === 'F'
    && keymap.d?.face === 'R'
    && keymap.f?.face === 'B'
    && keymap.r?.face === 'U'
    && keymap.v?.face === 'D',
  '六面键位固定为 A/S/D/F/R/V',
);
assert(keymap.e === undefined && keymap.c === undefined && keymap.w === undefined && keymap.x === undefined, '不存在旧键位 e/c/w/x 残留');
assert(keymap.j?.face === 'M' && keymap.k?.face === 'E' && keymap.l?.face === 'S', '中层键 J/K/L 保留');

// 2) 导入配置不做任何迁移改写：未知字段保留、缺省字段补默认
const merged = parseConfig({ reference: { front: 'blue' } });
assert(merged.reference.front === 'blue', '导入配置可覆盖字段');
assert(merged.keymap.r?.face === 'U', '导入配置不会改写键位（无静默迁移）');

// 3) 默认规则表（字母区）结构性正确
const rules = buildAlphabetRules();
assert(rules.length === 29, `字母区规则共 29 条（26 字母 + 3 功能键，实际 ${rules.length}）`);
const letters = rules.filter((rule) => /^[a-z]$/.test(rule.output));
assert(letters.length === 26, '覆盖 a-z 全部 26 个字母');
// 全部为两段扭转 → 等长 → 最长后缀匹配天然无前缀歧义
assert(letters.every((rule) => rule.when.length === 2), '字母规则全部为两段扭转');
// 两段规则的第一段必须 ∈ {U,E,D}，保证打字序列在边界不会误命中
const rows = new Set(['U', 'E', 'D']);
assert(letters.every((rule) => rows.has(rule.when[0].replace(/['2]$/, ''))), '字母规则首段都是行选择（U/E/D）');

// 4) 功能键独立占用前后中层 S
const functional = rules.filter((rule) => ['␣', '⌫', '⇥'].includes(rule.output));
assert(
  functional.length === 3
    && functional.every((rule) => rule.when[0].replace(/['2]$/, '') === 'S'),
  '功能键由 S 层承担',
);

// 5) 默认格子文字与输入法配置结构
assert(typeof DEFAULT_CONFIG.cells === 'object' && DEFAULT_CONFIG.cells.F5 === 'S', '默认格子文字以编号为键');
assert(DEFAULT_CONFIG.activeIme === 'pinyin26', '默认输入法为 26键拼音');
assert(DEFAULT_CONFIG.imeRules !== undefined && DEFAULT_CONFIG.rules === undefined, '规则表按输入法分表存储');

console.log('配置测试通过');
