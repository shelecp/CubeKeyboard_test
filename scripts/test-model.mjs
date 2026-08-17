// 魔方模型扭转逻辑的单元测试（不依赖 WebGL，可在 Node 中运行）。
// 用法：node scripts/test-model.mjs
import { CubeModel } from '../src/cube/CubeModel.js';

function round(value) {
  return Math.round(value * 1e9) / 1e9;
}

function snapshot(model) {
  return model.cubies.map((cubie) => ({
    id: cubie.id,
    pos: [cubie.pos.x, cubie.pos.y, cubie.pos.z].map(round),
    // 四元数存在“双覆盖”：q 与 -q 表示同一个旋转。
    // 这里把 w 规范化到非负，便于直接比较。
    orient: (() => {
      const [x, y, z, w] = [cubie.orient.x, cubie.orient.y, cubie.orient.z, cubie.orient.w];
      const sign = w < 0 ? -1 : 1;
      return [x * sign, y * sign, z * sign, w * sign].map(round);
    })(),
  }));
}

function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const model = new CubeModel();
const initial = snapshot(model);

// 1) 正面 F 顺时针：右上前角块 (1,1,1) 应移动到 (1,-1,1)
model.applyTurn('F', 1);
console.log('F 顺时针后，位置 (1,-1,1) 有小方块：', Boolean(model.byKey.get('1,-1,1')));
model.applyTurn("F", -1);
console.log('F 顺时针再逆时针回到初始：', equal(snapshot(model), initial));

// 2) 每个面顺时针转 4 次应回到原状
for (const face of ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S']) {
  const before = snapshot(model);
  for (let i = 0; i < 4; i += 1) model.applyTurn(face, 1);
  const ok = equal(snapshot(model), before);
  console.log(`${face} × 4 回到原状：`, ok);
  if (!ok) process.exit(1);
}

// 中心块方向检测（模拟陀螺仪）
const initialCenters = model.getCenterColors();
console.log('初始中心：正面 =', initialCenters.front, '，顶面 =', initialCenters.up);

model.applyTurn('M', 1);
const afterMCenters = model.getCenterColors();
console.log('M 后中心发生变化：', afterMCenters.front !== initialCenters.front || afterMCenters.up !== initialCenters.up);

for (let i = 0; i < 3; i += 1) model.applyTurn('M', 1);
const resetCenters = model.getCenterColors();
console.log('M × 4 回到初始中心：', resetCenters.front === initialCenters.front && resetCenters.up === initialCenters.up);

console.log('全部模型测试通过');
