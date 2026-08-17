import * as THREE from 'three';

// 独立于 DOM 的轨道相机数学模块。
// 结构采用“相机挂载组”（cameraHost）：
// - cameraRig 位于魔方中心（世界原点）；
// - 旋转只改 cameraRig 的四元数；
// - 平移只改相机在 rig 局部坐标中的 x/y；
// - 缩放只改相机在 rig 局部坐标中的 z（到中心的距离）。
//
// 这样可以把平移和旋转解耦：
// 平移后，魔方虽然离开画面中心，但后续旋转仍然围绕魔方中心进行；
// XYZ 参考线固定在世界原点，不会跟随相机或魔方移动。
export class CameraRig {
  constructor({
    yaw = 0,
    pitch = 0,
    distance = 10,
    minDistance = 4.5,
    maxDistance = 24,
    pivot = new THREE.Vector3(0, 0, 0),
  } = {}) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.distance = distance;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.pivot = pivot;

    // 相机在 rig 局部坐标中的平移量：x 向右，y 向上。
    this.pan = new THREE.Vector2(0, 0);

    this.rigQuaternion = new THREE.Quaternion();
    this.cameraLocalPosition = new THREE.Vector3();
    this.cameraWorldPosition = new THREE.Vector3();
    this.cameraWorldQuaternion = new THREE.Quaternion();

    this.clampDistance();
    this.update();
  }

  clampDistance() {
    this.distance = THREE.MathUtils.clamp(
      this.distance,
      this.minDistance,
      this.maxDistance,
    );
  }

  setDistance(distance) {
    this.distance = distance;
    this.clampDistance();
    this.update();
  }

  zoomBy(factor) {
    this.distance *= factor;
    this.clampDistance();
    this.update();
  }

  setPivot(pivot) {
    this.pivot.copy(pivot);
    this.update();
  }

  // 更新旋转四元数与相机局部/世界坐标。
  // 采用 YXZ 欧拉顺序，与常见轨道控制一致；相机局部四元数保持单位四元数。
  update() {
    this.clampDistance();
    // 与旧版球坐标方向一致：相机局部 +Z 经过该旋转后，
    // 世界方向为 (sin(yaw)*cos(pitch), sin(pitch), cos(yaw)*cos(pitch))。
    const euler = new THREE.Euler(-this.pitch, this.yaw, 0, 'YXZ');
    this.rigQuaternion.setFromEuler(euler);

    this.cameraLocalPosition.set(this.pan.x, this.pan.y, this.distance);
    this.cameraWorldPosition
      .copy(this.pivot)
      .add(this.cameraLocalPosition.clone().applyQuaternion(this.rigQuaternion));

    // 相机是 rig 的子节点，局部四元数为单位四元数，因此世界朝向 = rig 朝向。
    this.cameraWorldQuaternion.copy(this.rigQuaternion);
  }

  // 按屏幕像素平移：向右拖，物体向右移；向下拖，物体向下移。
  panByPixels(dx, dy, fovDeg, viewportHeight) {
    const height = Math.max(1, viewportHeight);
    const halfFov = THREE.MathUtils.degToRad(fovDeg) / 2;
    const worldPerPixel = (2 * this.distance * Math.tan(halfFov)) / height;

    this.pan.x -= dx * worldPerPixel;
    this.pan.y += dy * worldPerPixel;
    this.update();
  }

  resetPan() {
    this.pan.set(0, 0);
    this.update();
  }

  // 将世界坐标转换到相机局部坐标，便于自动化测试检查：
  // 魔方中心在相机空间中始终为 (-pan.x, -pan.y, -distance)，
  // 不会随着 yaw/pitch 旋转而变化。
  worldToCameraSpace(worldPoint, target = new THREE.Vector3()) {
    return target
      .copy(worldPoint)
      .sub(this.pivot)
      .applyQuaternion(this.rigQuaternion.clone().invert())
      .sub(this.cameraLocalPosition);
  }

  // 计算世界点在相机空间中的归一化投影偏移，用于数值测试。
  // 返回值约等于 (-pan.x / (distance*tan(hFov/2)), -pan.y / (distance*tan(vFov/2)))。
  projectNormalized(worldPoint, fovDeg, aspect = 1, target = new THREE.Vector3()) {
    const cameraSpace = this.worldToCameraSpace(worldPoint);
    const halfV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
    const halfH = halfV * aspect;
    target.set(
      cameraSpace.x / -cameraSpace.z / halfH,
      cameraSpace.y / -cameraSpace.z / halfV,
      cameraSpace.z,
    );
    return target;
  }
}
