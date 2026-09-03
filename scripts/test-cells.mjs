// 格子唯一编号体系测试：54 个编号、复原态布局、旋转后编号跟随小块。
import { CubeModel } from '../src/cube/CubeModel.js';
import { FACE_TURNS } from '../src/cube/CubeModel.js';

function assert(condition, label) {
  if (!condition) throw new Error(`${label} 不通过`);
  console.log(`${label}：true`);
}

const model = new CubeModel();

// 1) 54 个唯一编号
const ids = [];
for (const cubie of model.cubies) {
  for (const cellId of Object.values(cubie.cellIds || {})) ids.push(cellId);
}
assert(ids.length === 54, `贴纸编号共 54 个（实际 ${ids.length}）`);
assert(new Set(ids).size === 54, '贴纸编号全部唯一');
assert(model.cellOwner.size === 54, '编号索引覆盖 54 个贴纸');

// 2) 复原态编号布局抽查：F1 在左上角 (-1,1,1)，F5 是中心块，U1 在后上左
assert(model.cellOwner.get('F1').pos.x === -1 && model.cellOwner.get('F1').pos.y === 1 && model.cellOwner.get('F1').pos.z === 1, 'F1 位于正面左上');
assert(model.cellOwner.get('F5').pos.x === 0 && model.cellOwner.get('F5').pos.y === 0 && model.cellOwner.get('F5').pos.z === 1, 'F5 是正面中心');
assert(model.cellOwner.get('U1').pos.z === -1, 'U1 位于顶面后排');

// 3) 旋转后编号跟随小块：F 顺时针转动后，原 F1 小块移动到 (1,1,1)，
//    stickerAt 应返回它自己的编号 F1，而不是位置编号 F3。
const before = model.cellOwner.get('F1');
model.applyTurn('F', 1);
const hit = model.stickerAt({ x: 1, y: 1, z: 1 }, 'front');
assert(hit.cellId === 'F1' && hit.cubie === before, '旋转后编号跟随小块（F1 仍标识同一小块）');

// 4) 连续多次扭转后编号依然稳定
const model2 = new CubeModel();
const owner = new Map();
for (const cubie of model2.cubies) {
  for (const cellId of Object.values(cubie.cellIds || {})) owner.set(cellId, cubie);
}
for (const face of ['R', 'U', 'F', 'L', 'D', 'B', 'M', 'E', 'S']) {
  model2.applyTurn(face, 1);
  model2.applyTurn(face, -1);
}
let stable = true;
for (const [cellId, cubie] of owner) {
  if (model2.cellOwner.get(cellId) !== cubie) stable = false;
}
assert(stable, '多轮扭转后所有编号仍指向原小块');
assert(Object.keys(FACE_TURNS).length === 6, '面扭转元数据完整');

console.log('格子编号体系测试通过');
