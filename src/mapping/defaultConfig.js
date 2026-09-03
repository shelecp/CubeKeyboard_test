// 默认配置：参考系、键盘映射、输入法与格子文字映射。
//
// 【键位权威来源】六面键位固定为 a / s / d / f / r / v，布局如下：
//        R（顶面 U）
//   A（左 L） S（正 F） D（右 R） F（背 B）
//        V（底面 D）
// 另有 j / k / l 三个中层键（竖 M / 横 E / 前后 S）。
// 修改键位只改这里，并同步 README 与 index.html 的提示文案；
// 禁止再引入任何"旧键位迁移"逻辑（历史上 r/v→e/c 的静默迁移曾导致键位漂移）。
//
// 【默认扭转规则表设计】字母区统一为"两段扭转 = 一个字母"：
// 第一段选行（U/E/D），第二段选列（L/M/R/F/B），第二段带 ' 为逆时针。
// 26 个字母恰好占满 3×5×2 个槽位；全部等长，因此"最长后缀匹配"无前缀歧义。
// 功能键独立占用前后中层 S：S→空格、S'→退格、S2→上屏。
export const DEFAULT_CONFIG = {
  version: 3,
  reference: {
    front: 'white',
    up: 'red',
  },
  turnDurationMs: 180,
  keymap: {
    r: { face: 'U' },
    a: { face: 'L' },
    s: { face: 'F' },
    d: { face: 'R' },
    f: { face: 'B' },
    v: { face: 'D' },
    j: { face: 'M' },
    k: { face: 'E' },
    l: { face: 'S' },
  },
  // 当前使用的输入法 profile id，配置表见 src/configs/ime/*.json
  activeIme: 'pinyin26',
  // 每个输入法各自的扭转规则表（切换输入法即切换规则表）。
  // 空缺时由该输入法 profile 的 defaultRules 兜底。
  imeRules: {},
  // 格子文字映射：键为贴纸唯一编号（F1..F9、U1..U9 ...，随小块旋转不变），
  // 值为该格写着的文字。编辑模式修改的就是这里。
  cells: {
    F1: 'Q',
    F2: 'W',
    F3: 'E',
    F4: 'A',
    F5: 'S',
    F6: 'D',
    F7: 'Z',
    F8: 'X',
    F9: 'C',
  },
};

// 由上面的设计规则生成 a-z 的默认扭转序列表（供各输入法 profile 的 defaultRules 复用）
export function buildAlphabetRules(prefix = 'ime') {
  const rows = ['U', 'E', 'D'];
  const cols = ['L', 'M', 'R', 'F', 'B'];
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const rules = [];
  let index = 0;

  for (const row of rows) {
    for (const col of cols) {
      for (const dir of [1, -1]) {
        if (index >= letters.length) break;
        const token = dir === -1 ? `${col}'` : col;
        rules.push({
          id: `${prefix}-letter-${letters[index]}`,
          type: 'turn-sequence',
          when: [row, token],
          output: letters[index],
        });
        index += 1;
      }
    }
  }

  rules.push(
    { id: `${prefix}-space`, type: 'turn-sequence', when: ['S'], output: '␣' },
    { id: `${prefix}-backspace`, type: 'turn-sequence', when: ["S'"], output: '⌫' },
    { id: `${prefix}-commit`, type: 'turn-sequence', when: ['S2'], output: '⇥' },
  );
  return rules;
}
