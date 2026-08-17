// 相机轨道/平移数值测试。
// 这里只依赖 three 的数学类，不触碰 DOM，因此可以在 Node 中重复运行。
import * as THREE from 'three';
import { CameraRig } from '../src/cube/CameraRig.js';
import { detectOrientationFaces } from '../src/cube/orientationDetection.js';

function assertClose(actual, expected, epsilon, label) {
  const diff = Math.abs(actual - expected);
  if (diff > epsilon) {
    throw new Error(`${label} 不通过：实际 ${actual}，预期 ${expected}，误差 ${diff}`);
  }
  console.log(`${label}：${actual.toFixed(5)} ≈ ${expected.toFixed(5)}`);
}

function assertVecClose(actual, expected, epsilon, label) {
  const diff = actual.distanceTo(expected);
  if (diff > epsilon) {
    throw new Error(`${label} 不通过：实际 (${actual.toArray().join(', ')})，预期 (${expected.toArray().join(', ')})`);
  }
  console.log(`${label}：(x=${actual.x.toFixed(4)}, y=${actual.y.toFixed(4)}, z=${actual.z.toFixed(4)})`);
}

const origin = new THREE.Vector3(0, 0, 0);

// 1) 初始状态：魔方中心应投影在画面中心。
const rig = new CameraRig({
  yaw: 0.64,
  pitch: 0.45,
  distance: 10,
  minDistance: 4.5,
  maxDistance: 24,
  pivot: origin.clone(),
});
let cameraSpace = rig.worldToCameraSpace(origin);
assertVecClose(cameraSpace, new THREE.Vector3(0, 0, -10), 1e-5, '初始相机空间坐标');
let projected = rig.projectNormalized(origin, 42, 1);
assertClose(projected.x, 0, 1e-6, '初始投影 X');
assertClose(projected.y, 0, 1e-6, '初始投影 Y');

// 2) 向右/向下平移后，魔方中心应向右/向下偏移。
rig.panByPixels(60, 30, 42, 800);
projected = rig.projectNormalized(origin, 42, 1);
if (!(projected.x > 0 && projected.y < 0)) {
  throw new Error(`平移投影方向错误：x=${projected.x}, y=${projected.y}`);
}
console.log(`平移投影方向：x=${projected.x.toFixed(4)}（应 >0），y=${projected.y.toFixed(4)}（应 <0）`);

// 3) 旋转前后，魔方中心在相机空间中的位置不应改变（只绕魔方中心旋转）。
const beforeRotate = rig.worldToCameraSpace(origin).clone();
rig.yaw += 1.2;
rig.pitch -= 0.35;
rig.update();
const afterRotate = rig.worldToCameraSpace(origin);
assertVecClose(afterRotate, beforeRotate, 1e-5, '旋转前后相机空间中心不变');

// 4) 相机世界位置到魔方中心的距离，在旋转过程中保持恒定。
const beforeWorldDistance = rig.cameraWorldPosition.distanceTo(rig.pivot);
rig.yaw += 2.0;
rig.pitch += 0.4;
rig.update();
const afterWorldDistance = rig.cameraWorldPosition.distanceTo(rig.pivot);
assertClose(afterWorldDistance, beforeWorldDistance, 1e-5, '旋转前后相机距离');

// 5) 再平移一次后仍可恢复：清空平移，魔方中心应回到投影中心。
rig.resetPan();
projected = rig.projectNormalized(origin, 42, 1);
assertClose(projected.x, 0, 1e-6, '复位后投影 X');
assertClose(projected.y, 0, 1e-6, '复位后投影 Y');

// 6) 多轮平移、旋转、缩放不应产生 NaN。
for (let i = 0; i < 20; i += 1) {
  rig.panByPixels((i - 10) * 3, (i - 4) * 2, 42, 700);
  rig.yaw += 0.13;
  rig.pitch -= 0.09;
  rig.zoomBy(i % 2 === 0 ? 1.03 : 0.97);
}
if (!Number.isFinite(rig.cameraWorldPosition.x)
  || !Number.isFinite(rig.cameraWorldPosition.y)
  || !Number.isFinite(rig.cameraWorldPosition.z)) {
  throw new Error(`多轮操作后出现非有限坐标：${rig.cameraWorldPosition.toArray()}`);
}
console.log('多轮操作坐标保持有限：', rig.cameraWorldPosition.toArray().map((v) => v.toFixed(3)).join(', '));

// 7) 用真实 Three.js Group + PerspectiveCamera 复现渲染器挂载方式，
//    检查“平移 -> 旋转”后魔方中心在屏幕上的投影位置保持不变。
{
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(42, 1.4, 0.1, 100);
  group.add(camera);

  const applyRig = () => {
    rig.update();
    group.position.copy(rig.pivot);
    group.quaternion.copy(rig.rigQuaternion);
    camera.position.copy(rig.cameraLocalPosition);
    camera.quaternion.identity();
    group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  };

  rig.resetPan();
  rig.yaw = 0.4;
  rig.pitch = 0.3;
  applyRig();
  const before = origin.clone().project(camera);

  rig.panByPixels(90, 45, camera.fov, 900);
  applyRig();
  const panned = origin.clone().project(camera);

  rig.yaw += 0.85;
  rig.pitch -= 0.22;
  applyRig();
  const rotatedAfterPan = origin.clone().project(camera);

  assertClose(rotatedAfterPan.x, panned.x, 1e-4, '真实相机平移后旋转投影 X');
  assertClose(rotatedAfterPan.y, panned.y, 1e-4, '真实相机平移后旋转投影 Y');
  if (Math.abs(before.x - panned.x) < 1e-5 && Math.abs(before.y - panned.y) < 1e-5) {
    throw new Error('平移后投影没有变化，说明平移未生效');
  }
console.log('真实相机平移后旋转：投影位置保持不变（说明旋转中心仍为魔方）');
}

// 8) 俯仰角越过顶部/底部不应出现 NaN，且方向模拟的正面/顶面会发生变化。
{
  const topBottomRig = new CameraRig({ yaw: 0, pitch: 0, distance: 10 });
  const faceAt = (pitch) => {
    topBottomRig.pitch = pitch;
    topBottomRig.update();
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(topBottomRig.rigQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(topBottomRig.rigQuaternion);
    return detectOrientationFaces(new THREE.Quaternion(), up, front);
  };

  const start = faceAt(0);
  const overTop = faceAt(Math.PI / 2);
  const overBottom = faceAt(-Math.PI / 2);
  const changed = overTop.upFace !== start.upFace || overTop.frontFace !== start.frontFace
    || overBottom.upFace !== start.upFace || overBottom.frontFace !== start.frontFace;
  if (!changed) throw new Error('越过顶部/底部后方向模拟结果没有变化');
  if (!Number.isFinite(topBottomRig.cameraWorldPosition.x)
    || !Number.isFinite(topBottomRig.cameraWorldPosition.y)
    || !Number.isFinite(topBottomRig.cameraWorldPosition.z)) {
    throw new Error('越过顶部/底部后出现非有限相机坐标');
  }
  console.log('越过顶部/底部：方向模拟会变化，相机坐标保持有限');
}

console.log('相机轨道/平移测试通过');
