// 陀螺仪/方向检测逻辑测试。
import * as THREE from 'three';
import { detectOrientationFaces } from '../src/cube/orientationDetection.js';
import { CubeModel } from '../src/cube/CubeModel.js';
import { PoseDetector } from '../src/cube/pose.js';

// 1) 单位四元数表示无旋转
const identity = new THREE.Quaternion();
console.log('单位四元数无旋转：', identity.lengthSq() > 0.99 && Math.abs(identity.w) > 0.99);

// 2) 无旋转时：朝上=up，朝用户=front
const base = new THREE.Quaternion();
let faces = detectOrientationFaces(base);
console.log('无旋转方向判定：', faces.upFace === 'up' && faces.frontFace === 'front');

// 3) 绕 X 轴 -90°：原正面(+Z)朝上，原底面(-Y)朝用户
const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
faces = detectOrientationFaces(turned);
console.log('绕 X 轴 -90° 方向判定：', faces.upFace === 'front' && faces.frontFace === 'down');

// 4) PoseDetector 集成：映射到当前中心颜色
const model = new CubeModel();
const pose = new PoseDetector();
pose.setMode('simulate');
pose.orientation = new THREE.Quaternion();
const detected = pose.detectFromOrientation(model, turned);
console.log('PoseDetector 颜色映射：', detected.front === 'orange' && detected.up === 'white');

// 5) 临界角度时优先保持上一帧，避免传感器噪声导致正/顶面来回跳。
pose.orientation = new THREE.Quaternion();
pose.detectFromOrientation(model, new THREE.Quaternion());
const nearBoundary = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  Math.PI / 4,
);
const stable = pose.detectFromOrientation(model, nearBoundary);
console.log(
  '45° 临界方向保持上一帧：',
  stable.upFace === 'up' && stable.frontFace === 'front',
);

// 6) 明显旋转时应切换到新的面。
const clearTurn = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  Math.PI / 2,
);
const switched = pose.detectFromOrientation(model, clearTurn);
console.log(
  '90° 明显方向切换：',
  switched.upFace === 'right' && switched.frontFace === 'front',
);

// 7) 返回初始姿态后应再次切换回 up/front。
pose.detectFromOrientation(model, new THREE.Quaternion());
const info = pose.getDetectionInfo();
console.log(
  '回到初始方向：',
  info.upFace === 'up' && info.frontFace === 'front' && info.front === 'white' && info.up === 'red',
);

// 8) UI 方向模拟：不读取设备方向，而是根据固定 XYZ + 相机所在方向判断。
const frontView = detectOrientationFaces(
  new THREE.Quaternion(),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
);
const simulatedFront = pose.updateFromSimulatedView(model, frontView);
console.log(
  '方向模拟：相机在前方 -> front/white, up/red：',
  simulatedFront.front === 'white' && simulatedFront.up === 'red',
);

const backView = detectOrientationFaces(
  new THREE.Quaternion(),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, -1),
);
const simulatedBack = pose.updateFromSimulatedView(model, backView);
console.log(
  '方向模拟：相机在后方 -> front/yellow：',
  simulatedBack.front === 'yellow' && simulatedBack.up === 'red',
);

// 9) 手动模式应固定目标颜色，并在中层转动后继续跟随这些颜色所在的面。
const manualModel = new CubeModel();
const manualPose = new PoseDetector();
manualPose.setMode('manual');
manualPose.setReference({ front: 'white', up: 'red' });
let manualDetection = manualPose.updateFromTargetColors(manualModel);
const manualInitialOk = manualDetection.frontFace === 'front' && manualDetection.upFace === 'up';

manualModel.applyTurn('M', 1);
manualDetection = manualPose.updateFromTargetColors(manualModel);
const manualFollowOk = manualDetection.frontFace === 'down' && manualDetection.upFace === 'front';
console.log(
  '手动模式固定颜色并跟随中心块：',
  manualInitialOk && manualFollowOk,
);

console.log('陀螺仪逻辑测试通过');
