// 默认配置：参考系、键盘映射、规则与贴纸映射。
// 用户给的默认键位是六面体展开图布局：
//    E
//  A S D F
//    C
// 对应：E=顶、A=左、S=正、D=右、F=背、C=底。
export const DEFAULT_CONFIG = {
  version: 1,
  reference: {
    front: 'white',
    up: 'red',
  },
  turnDurationMs: 180,
  keymap: {
    e: { face: 'U' },
    a: { face: 'L' },
    s: { face: 'F' },
    d: { face: 'R' },
    f: { face: 'B' },
    c: { face: 'D' },
    j: { face: 'M' },
    k: { face: 'E' },
    l: { face: 'S' },
  },
  rules: [
    {
      id: 'demo-a',
      type: 'turn-sequence',
      when: ['R', 'B'],
      output: 'a',
    },
    {
      id: 'default-delete',
      type: 'turn-sequence',
      when: ['M'],
      output: '⌫',
    },
    {
      id: 'default-space',
      type: 'turn-sequence',
      when: ['E'],
      output: '␣',
    },
    {
      id: 'default-complete',
      type: 'turn-sequence',
      when: ['S'],
      output: '⇥',
    },
  ],
  stickerMaps: [
    {
      id: 'demo-front-9',
      face: 'F',
      cells: {
        '0,0': 'Q',
        '0,1': 'W',
        '0,2': 'E',
        '1,0': 'A',
        '1,1': 'S',
        '1,2': 'D',
        '2,0': 'Z',
        '2,1': 'X',
        '2,2': 'C',
      },
    },
  ],
};
