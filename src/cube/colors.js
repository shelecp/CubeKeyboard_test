// 魔方颜色定义与“面 → 颜色”的推导逻辑。
// 默认参考系：正面 = 白，顶面 = 红；相对色：白↔黄、红↔橙、蓝↔绿。

export const HEX_COLORS = {
  white: 0xf5f5f5,
  yellow: 0xf5c518,
  red: 0xc0392b,
  orange: 0xe67e22,
  blue: 0x2471a3,
  green: 0x229954,
  inner: 0x141414, // 魔方内部的塑料底色（非贴纸面）
};

// 可选颜色名称（用于下拉框等 UI）
export const COLOR_NAMES = Object.keys(HEX_COLORS).filter((name) => name !== 'inner');

// 相对面的颜色映射，保证配色始终成对
export const OPPOSITE = {
  white: 'yellow',
  yellow: 'white',
  red: 'orange',
  orange: 'red',
  blue: 'green',
  green: 'blue',
};

// 默认“面 → 颜色”：正面白、背面黄、顶面红、底面橙、右面蓝、左面绿
export const DEFAULT_FACE_COLORS = {
  front: 'white',
  back: 'yellow',
  up: 'red',
  down: 'orange',
  right: 'blue',
  left: 'green',
};

// 根据“正面颜色 + 顶面颜色”推导完整的面颜色映射。
// 剩余两个颜色按约定分配给右/左面，并优先让右面为蓝色（保持与默认一致）。
export function deriveFaceColors({ front, up }) {
  const back = OPPOSITE[front];
  const down = OPPOSITE[up];
  const used = new Set([front, back, up, down]);
  const remaining = COLOR_NAMES.filter((name) => !used.has(name));

  let right;
  let left;
  if (remaining.includes('blue')) {
    right = 'blue';
    left = remaining.find((name) => name !== 'blue');
  } else {
    [right, left] = remaining;
  }

  return { front, back, up, down, right, left };
}
