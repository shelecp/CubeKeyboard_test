// 参考系变化后的键盘/层映射测试。
import {
  buildFaceMapping,
  resolveRelativeTurn,
  resolveKeymap,
} from '../src/cube/orientationMap.js';

function assert(condition, label) {
  if (!condition) throw new Error(`${label} 不通过`);
  console.log(`${label}：true`);
}

// 1) 默认参考系应原样映射。
let mapping = buildFaceMapping('front', 'up');
assert(
  mapping.F === 'F' && mapping.B === 'B' && mapping.U === 'U'
    && mapping.D === 'D' && mapping.R === 'R' && mapping.L === 'L',
  '默认参考系面映射',
);

// 2) 正面变成背面时，左右应互换。
mapping = buildFaceMapping('back', 'up');
assert(
  mapping.F === 'B' && mapping.B === 'F' && mapping.R === 'L' && mapping.L === 'R',
  '正面变为背面时左右互换',
);

// 3) 正面变成右面时，逻辑面应映射到新的世界面。
mapping = buildFaceMapping('right', 'up');
const mappedValues = new Set(Object.values(mapping));
assert(mapping.F === 'R' && mappedValues.size === 6, '正面变为右面时映射完整');

// 4) 逻辑面扭转解析：F 在当前正面为背面时应转到 B。
let resolved = resolveRelativeTurn('F', 1, 'back', 'up');
assert(resolved.face === 'B' && resolved.dir === 1, '逻辑 F 转到世界 B');

// 5) 中层方向应随参考系翻转。
resolved = resolveRelativeTurn('M', 1, 'back', 'up');
assert(resolved.face === 'M' && resolved.dir === -1, '背面为正面时 M 方向翻转');

// 6) 键盘映射整体解析。
const resolvedMap = resolveKeymap(
  { s: { face: 'F' }, e: { face: 'U' }, j: { face: 'M' } },
  'back',
  'up',
);
assert(
  resolvedMap.s.face === 'B'
    && resolvedMap.e.face === 'U'
    && resolvedMap.j.face === 'M'
    && resolvedMap.j.dir === -1,
  '键盘映射随参考系更新',
);

console.log('参考系层映射测试通过');
