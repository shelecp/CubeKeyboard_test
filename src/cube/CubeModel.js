import * as THREE from 'three';
import { deriveFaceColors } from './colors.js';

// 六面的扭转元数据：
// - axis：绕哪个世界坐标轴旋转
// - layer：该面所在的层（+1 或 -1）
// - coord：层对应的坐标轴
// - sign：顺时针（面对该面看）对应的旋转方向符号
export const FACE_TURNS = {
  U: { axis: new THREE.Vector3(0, 1, 0), layer: 1, coord: 'y', sign: -1 },
  D: { axis: new THREE.Vector3(0, 1, 0), layer: -1, coord: 'y', sign: 1 },
  R: { axis: new THREE.Vector3(1, 0, 0), layer: 1, coord: 'x', sign: -1 },
  L: { axis: new THREE.Vector3(1, 0, 0), layer: -1, coord: 'x', sign: 1 },
  F: { axis: new THREE.Vector3(0, 0, 1), layer: 1, coord: 'z', sign: -1 },
  B: { axis: new THREE.Vector3(0, 0, 1), layer: -1, coord: 'z', sign: 1 },
};

// 三个中层：M=左右之间（竖中层），E=上下之间（横中层），S=前后之间。
// 方向约定遵循标准记法：M 随 L、E 随 D、S 随 F。
export const SLICE_TURNS = {
  M: { axis: new THREE.Vector3(1, 0, 0), layer: 0, coord: 'x', sign: 1 },
  E: { axis: new THREE.Vector3(0, 1, 0), layer: 0, coord: 'y', sign: 1 },
  S: { axis: new THREE.Vector3(0, 0, 1), layer: 0, coord: 'z', sign: -1 },
};

export const ALL_TURNS = { ...FACE_TURNS, ...SLICE_TURNS };

// 局部面法线，顺序与 cubie.colors 一致：+X、-X、+Y、-Y、+Z、-Z
const LOCAL_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

// 用于界面的中文面名称
export const FACE_NAMES_ZH = {
  U: '顶面',
  D: '底面',
  R: '右面',
  L: '左面',
  F: '正面',
  B: '背面',
  M: '竖中层',
  E: '横中层',
  S: '前后中层',
};

// 魔方逻辑状态：维护每个小方块的位置与朝向。
// 世界坐标约定：+X 右、+Y 上、+Z 前（即正面朝向 +Z）。
export class CubeModel {
  constructor() {
    this.faceColors = deriveFaceColors({ front: 'white', up: 'red' });
    this.cubies = [];
    this.byKey = new Map();
    this.buildSolved();
  }

  // 根据新的面颜色方案重建为“已复原”状态
  setFaceColors(faceColors) {
    this.faceColors = { ...faceColors };
    this.buildSolved();
  }

  buildSolved() {
    const colors = this.faceColors;
    const faceToColor = {
      right: colors.right,
      left: colors.left,
      up: colors.up,
      down: colors.down,
      front: colors.front,
      back: colors.back,
    };

    this.cubies = [];
    this.byKey = new Map();

    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          // 内部中心块不可见，跳过
          if (x === 0 && y === 0 && z === 0) continue;

          const cubie = {
            id: `${x},${y},${z}`,
            pos: new THREE.Vector3(x, y, z),
            orient: new THREE.Quaternion(),
            // 材质顺序与 BoxGeometry 一致：+X、-X、+Y、-Y、+Z、-Z
            colors: [
              x === 1 ? faceToColor.right : 'inner',
              x === -1 ? faceToColor.left : 'inner',
              y === 1 ? faceToColor.up : 'inner',
              y === -1 ? faceToColor.down : 'inner',
              z === 1 ? faceToColor.front : 'inner',
              z === -1 ? faceToColor.back : 'inner',
            ],
          };

          this.cubies.push(cubie);
          this.byKey.set(this.keyOf(cubie.pos), cubie);
        }
      }
    }
  }

  keyOf(vector) {
    return `${vector.x},${vector.y},${vector.z}`;
  }

  // 计算一次扭转的信息，但不修改状态（供渲染层做动画）
  computeTurn(face, dir = 1) {
    const meta = ALL_TURNS[face];
    if (!meta) throw new Error(`未知的魔方面：${face}`);

    // dir：1 = 顺时针，-1 = 逆时针，2 = 180°
    const angle = meta.sign * dir * (Math.PI / 2);
    const rotation = new THREE.Quaternion().setFromAxisAngle(meta.axis, angle);
    const affected = this.cubies.filter((cubie) => cubie.pos[meta.coord] === meta.layer);

    return { meta, angle, rotation, affected };
  }

  // 提交一次扭转：更新受影响方块的位置与朝向
  applyTurn(face, dir = 1) {
    const { rotation, affected } = this.computeTurn(face, dir);

    for (const cubie of affected) {
      cubie.pos.applyQuaternion(rotation);
      cubie.pos.set(
        Math.round(cubie.pos.x),
        Math.round(cubie.pos.y),
        Math.round(cubie.pos.z),
      );
      cubie.orient.premultiply(rotation);
      cubie.orient.normalize();
    }

    this.byKey.clear();
    for (const cubie of this.cubies) {
      this.byKey.set(this.keyOf(cubie.pos), cubie);
    }

    return { rotation, affected };
  }

  reset() {
    this.buildSolved();
  }

  // 输出当前状态快照，后续供“状态匹配型规则”使用
  serialize() {
    return {
      cubies: this.cubies.map((cubie) => ({
        id: cubie.id,
        pos: [cubie.pos.x, cubie.pos.y, cubie.pos.z],
        orient: [cubie.orient.x, cubie.orient.y, cubie.orient.z, cubie.orient.w],
        colors: [...cubie.colors],
      })),
    };
  }

  // 读取当前世界坐标系下六个面的“中心块贴纸颜色”。
  // 世界坐标约定不变：+Z 为前、+Y 为上、+X 为右。
  // 中层转动会让中心块换位，因此这里返回的是“此刻”各面中心实际颜色。
  getCenterColors() {
    const read = (x, y, z, worldNormal) => {
      const cubie = this.byKey.get(`${x},${y},${z}`);
      if (!cubie) return null;

      let bestIndex = -1;
      let bestDot = -Infinity;
      for (let index = 0; index < 6; index += 1) {
        const direction = LOCAL_NORMALS[index].clone().applyQuaternion(cubie.orient);
        const dot = direction.dot(worldNormal);
        if (dot > bestDot) {
          bestDot = dot;
          bestIndex = index;
        }
      }
      return cubie.colors[bestIndex];
    };

    return {
      front: read(0, 0, 1, new THREE.Vector3(0, 0, 1)),
      back: read(0, 0, -1, new THREE.Vector3(0, 0, -1)),
      up: read(0, 1, 0, new THREE.Vector3(0, 1, 0)),
      down: read(0, -1, 0, new THREE.Vector3(0, -1, 0)),
      right: read(1, 0, 0, new THREE.Vector3(1, 0, 0)),
      left: read(-1, 0, 0, new THREE.Vector3(-1, 0, 0)),
    };
  }
}
