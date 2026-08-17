import * as THREE from 'three';

// 六个面的局部法线，键名与 CubeModel.getCenterColors() 的返回键保持一致。
export const FACE_NORMALS = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  up: new THREE.Vector3(0, 1, 0),
  down: new THREE.Vector3(0, -1, 0),
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
};

// 每个面属于哪个坐标轴；同轴的两个面互为对面。
export const FACE_AXES = {
  front: 'z',
  back: 'z',
  up: 'y',
  down: 'y',
  right: 'x',
  left: 'x',
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// 给定一个整体姿态四元数，判断哪个面最接近“朝上”，哪个面最接近“朝向用户”。
// up 与 front 是世界参考方向，默认 +Y 为上、+Z 为朝用户。
//
// 这里不是简单地分别取最大值，而是联合选择一对“不同轴”的面：
// 因为世界参考的上方向和前方向天然垂直，所以最终 up/front 不能落在同一根轴。
export function detectOrientationFaces(
  quaternion,
  up = new THREE.Vector3(0, 1, 0),
  front = new THREE.Vector3(0, 0, 1),
  {
    minUpDot = 0.25,
    minFrontDot = 0.25,
  } = {},
) {
  const candidates = [];

  for (const [name, normal] of Object.entries(FACE_NORMALS)) {
    const worldNormal = normal.clone().applyQuaternion(quaternion);
    const dotUp = worldNormal.dot(up);
    const dotFront = worldNormal.dot(front);
    candidates.push({ name, axis: FACE_AXES[name], dotUp, dotFront });
  }

  const byUp = [...candidates].sort((a, b) => b.dotUp - a.dotUp);
  const byFront = [...candidates].sort((a, b) => b.dotFront - a.dotFront);

  let best = null;
  let bestScore = -Infinity;

  // 联合搜索：在所有“不同轴”的面组合中选择综合得分最高的那组。
  for (const upCandidate of byUp) {
    for (const frontCandidate of byFront) {
      if (upCandidate.axis === frontCandidate.axis) continue;
      const score = upCandidate.dotUp + frontCandidate.dotFront;
      if (score > bestScore) {
        bestScore = score;
        best = {
          upFace: upCandidate.name,
          frontFace: frontCandidate.name,
          upDot: upCandidate.dotUp,
          frontDot: frontCandidate.dotFront,
        };
      }
    }
  }

  // 理论上总会有一对不同轴的面；若未来传入异常四元数，退回独立最大值。
  if (!best) {
    const fallbackUp = byUp[0];
    const fallbackFront = byFront.find((item) => item.axis !== fallbackUp.axis) || byFront[0];
    best = {
      upFace: fallbackUp.name,
      frontFace: fallbackFront.name,
      upDot: fallbackUp.dotUp,
      frontDot: fallbackFront.dotFront,
    };
  }

  const confidence = clamp01((best.upDot + best.frontDot) / 2);
  const ambiguous = best.upDot < minUpDot || best.frontDot < minFrontDot;

  return {
    ...best,
    confidence,
    ambiguous,
    candidates: byUp.map((item) => ({
      face: item.name,
      upDot: item.dotUp,
      frontDot: item.dotFront,
    })),
  };
}
