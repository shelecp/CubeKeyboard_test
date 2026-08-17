// 扭转记法与“面”的规范化。
// 面统一为 U/D/R/L/F/B，避免前端传中文或英文别名时出错。

export const FACE_ALIASES = {
  U: 'U',
  D: 'D',
  R: 'R',
  L: 'L',
  F: 'F',
  B: 'B',
  M: 'M',
  E: 'E',
  S: 'S',
  UP: 'U',
  DOWN: 'D',
  RIGHT: 'R',
  LEFT: 'L',
  FRONT: 'F',
  BACK: 'B',
  up: 'U',
  down: 'D',
  right: 'R',
  left: 'L',
  front: 'F',
  back: 'B',
  middle: 'M',
  equator: 'E',
  standing: 'S',
  top: 'U',
  bottom: 'D',
  顶: 'U',
  上: 'U',
  底: 'D',
  下: 'D',
  右: 'R',
  左: 'L',
  前: 'F',
  正: 'F',
  后: 'B',
  背: 'B',
  竖: 'M',
  中竖: 'M',
  横: 'E',
  中横: 'E',
  前后: 'S',
};

export function normalizeFace(face) {
  const key = String(face).trim();
  const upper = key.toUpperCase();
  if (FACE_ALIASES[upper]) return FACE_ALIASES[upper];
  if (FACE_ALIASES[key]) return FACE_ALIASES[key];
  throw new Error(`未知的魔方面：${face}`);
}

// 解析单个扭转：'F'、'B2'、"R'" 等，统一为 { face, dir }。
// dir：1 = 顺时针，-1 = 逆时针，2 = 180°。
export function normalizeMove(token) {
  if (typeof token === 'string') {
    const match = token.trim().match(/^([A-Za-z])(['2]?)$/);
    if (!match) throw new Error(`无效扭转记法：${token}`);
    return {
      face: normalizeFace(match[1]),
      dir: match[2] === "'" ? -1 : match[2] === '2' ? 2 : 1,
    };
  }

  if (!token || !token.face) throw new Error('无效扭转：缺少 face');
  const dir = token.dir === -1 ? -1 : token.dir === 2 ? 2 : 1;
  return { face: normalizeFace(token.face), dir };
}

export function normalizeSequence(when) {
  const list = Array.isArray(when) ? when : [when];
  return list.map(normalizeMove);
}

export function moveToString(move) {
  if (move.dir === -1) return `${move.face}'`;
  if (move.dir === 2) return `${move.face}2`;
  return move.face;
}
