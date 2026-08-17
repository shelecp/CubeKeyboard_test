import * as THREE from 'three';
import { FACE_NORMALS } from './orientationDetection.js';
import { FACE_TURNS, SLICE_TURNS } from './CubeModel.js';

// 把“用户视角下的逻辑面”映射到“魔方模型中的世界面”。
// 例如当方向模拟判定 frontFace=back 时：
// - 键盘 S（逻辑 F）实际应扭转世界面 B；
// - 键盘 W（逻辑 U）仍看 upFace 决定。

const FACE_KEYS = new Set(['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S']);

export function oppositeFace(face) {
  const key = String(face).toLowerCase();
  const map = {
    front: 'back',
    back: 'front',
    up: 'down',
    down: 'up',
    right: 'left',
    left: 'right',
  };
  return map[key] || key;
}

function faceVector(face) {
  const key = String(face).toLowerCase();
  if (!FACE_NORMALS[key]) throw new Error(`未知的朝向面：${face}`);
  return FACE_NORMALS[key].clone();
}

function faceNameForVector(vector) {
  let best = 'front';
  let bestDot = -Infinity;
  for (const [name, normal] of Object.entries(FACE_NORMALS)) {
    const dot = normal.dot(vector);
    if (dot > bestDot) {
      bestDot = dot;
      best = name;
    }
  }
  return best;
}

function faceNameToNotation(name) {
  const map = {
    front: 'F',
    back: 'B',
    up: 'U',
    down: 'D',
    right: 'R',
    left: 'L',
  };
  return map[name] || 'F';
}

export function buildFaceMapping(frontFace = 'front', upFace = 'up') {
  const front = faceVector(frontFace);
  const up = faceVector(upFace);

  // 正常情况下 front/up 属于不同轴；若调用方传入异常组合，退回默认参考系。
  if (front.dot(up) !== 0) {
    return {
      F: 'F',
      B: 'B',
      U: 'U',
      D: 'D',
      R: 'R',
      L: 'L',
    };
  }

  const right = up.clone().cross(front);
  const left = right.clone().negate();
  const down = up.clone().negate();
  const back = front.clone().negate();

  return {
    F: faceNameToNotation(faceNameForVector(front)),
    B: faceNameToNotation(faceNameForVector(back)),
    U: faceNameToNotation(faceNameForVector(up)),
    D: faceNameToNotation(faceNameForVector(down)),
    R: faceNameToNotation(faceNameForVector(right)),
    L: faceNameToNotation(faceNameForVector(left)),
  };
}

// 解析一次“用户视角逻辑扭转”。
// 返回：
// - face：实际传给 CubeModel/CubeRenderer 的世界面；
// - dir：必要时翻转后的世界扭转方向；
// - logicalFace：进入规则引擎时仍使用用户视角记法。
export function resolveRelativeTurn(
  face,
  dir = 1,
  frontFace = 'front',
  upFace = 'up',
) {
  const logicalFace = String(face).toUpperCase();
  if (!FACE_KEYS.has(logicalFace)) throw new Error(`未知的逻辑面：${face}`);

  const mapping = buildFaceMapping(frontFace, upFace);

  if (FACE_TURNS[logicalFace]) {
    return {
      face: mapping[logicalFace],
      dir,
      logicalFace,
    };
  }

  // 三个中层分别跟随一个相邻面：
  // M 随 L，E 随 D，S 随 F。
  const followedFace = { M: 'L', E: 'D', S: 'F' }[logicalFace];
  const desiredWorldFace = mapping[followedFace];
  const desiredMeta = FACE_TURNS[desiredWorldFace];

  let sliceName = null;
  let sliceMeta = null;
  for (const [name, meta] of Object.entries(SLICE_TURNS)) {
    if (meta.axis.dot(desiredMeta.axis) > 0.999) {
      sliceName = name;
      sliceMeta = meta;
      break;
    }
  }

  if (!sliceName) throw new Error(`无法为逻辑中层 ${logicalFace} 找到对应世界层`);

  // 180° 无需关心方向；正逆时针则根据两个记法的 sign 是否一致来翻转。
  const resolvedDir = dir === 2
    ? 2
    : dir * (desiredMeta.sign === sliceMeta.sign ? 1 : -1);

  return {
    face: sliceName,
    dir: resolvedDir,
    logicalFace,
  };
}

export function resolveKeymap(keymap, frontFace = 'front', upFace = 'up') {
  const resolved = {};
  for (const [key, mapping] of Object.entries(keymap || {})) {
    resolved[key] = resolveRelativeTurn(mapping.face, 1, frontFace, upFace);
  }
  return resolved;
}
