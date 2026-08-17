import { detectOrientationFaces } from './orientationDetection.js';

// 参考系与朝向检测。
// - manual：正面/顶面颜色由用户固定；魔方中层转动后，自动在当前魔方中寻找这两种颜色所在的世界面。
// - simulate：UI 方向模拟，不读取真实设备陀螺仪；结合固定 XYZ 与相机视角判断。
export class PoseDetector {
  constructor() {
    this.mode = 'manual';
    this.reference = { front: 'white', up: 'red' };
    this.orientation = null;
    this.detection = null;
    this._lastFaces = { upFace: 'up', frontFace: 'front' };
    this._faceSwitchMargin = 0.18;
  }

  setMode(mode) {
    this.mode = mode === 'simulate' || mode === 'gyro' ? 'simulate' : 'manual';
  }

  setReference(reference) {
    this.reference = { ...this.reference, ...reference };
  }

  getReference() {
    return { ...this.reference };
  }

  getUpFace() {
    return this.reference.up;
  }

  getFrontFace() {
    return this.reference.front;
  }

  // 手动模式：根据固定目标颜色，找到它们当前所在的世界面。
  // 这样白色/红色被中层转到其他面后，frontFace/upFace 会跟着白色/红色走。
  updateFromTargetColors(model) {
    const centers = model.getCenterColors();
    const frontFace = this._findFaceByColor(centers, this.reference.front) || 'front';
    const upFace = this._findFaceByColor(centers, this.reference.up) || 'up';

    const detection = {
      front: this.reference.front,
      up: this.reference.up,
      frontFace,
      upFace,
      confidence: 1,
      ambiguous: false,
      method: 'manual-target',
      centers,
    };

    this.detection = detection;
    this._lastFaces = { upFace, frontFace };
    return detection;
  }

  // 基于整体姿态四元数，判断哪两个面朝上/朝用户，并映射为当前中心颜色。
  // 这是方向模拟和自动化测试使用，不读取真实硬件传感器。
  detectFromOrientation(model, quaternion) {
    const raw = detectOrientationFaces(quaternion);
    const faces = this._selectStableFaces(raw);
    const centers = model.getCenterColors();
    const detection = {
      front: centers[faces.frontFace],
      up: centers[faces.upFace],
      upFace: faces.upFace,
      frontFace: faces.frontFace,
      upDot: faces.upDot,
      frontDot: faces.frontDot,
      confidence: faces.confidence,
      ambiguous: faces.ambiguous,
      method: 'orientation',
      centers,
      raw: raw.candidates,
    };
    this.detection = detection;
    this._lastFaces = { upFace: faces.upFace, frontFace: faces.frontFace };
    return detection;
  }

  getDetectionInfo() {
    if (!this.detection) return null;
    return {
      front: this.detection.front,
      up: this.detection.up,
      frontFace: this.detection.frontFace,
      upFace: this.detection.upFace,
      confidence: this.detection.confidence ?? null,
      ambiguous: this.detection.ambiguous ?? false,
      method: this.detection.method ?? 'unknown',
    };
  }

  // UI 模拟模式：不读取真实陀螺仪，而是根据固定 XYZ 和当前相机视角判断。
  updateFromSimulatedView(model, faces) {
    const stable = this._selectStableFaces(faces);
    const centers = model.getCenterColors();
    const detection = {
      front: centers[stable.frontFace],
      up: centers[stable.upFace],
      upFace: stable.upFace,
      frontFace: stable.frontFace,
      upDot: stable.upDot,
      frontDot: stable.frontDot,
      confidence: stable.confidence,
      ambiguous: stable.ambiguous,
      method: 'view-simulation',
      centers,
      raw: faces.candidates,
    };
    this.detection = detection;
    this._lastFaces = { upFace: stable.upFace, frontFace: stable.frontFace };
    this.reference = { front: detection.front, up: detection.up };
    return detection;
  }

  _findFaceByColor(centers, color) {
    for (const [face, centerColor] of Object.entries(centers)) {
      if (centerColor === color) return face;
    }
    return null;
  }

  // 滞后逻辑：新结果明显更强时才切换；否则继续沿用上一帧的面。
  _selectStableFaces(raw) {
    const candidate = {
      upFace: raw.upFace,
      frontFace: raw.frontFace,
      upDot: raw.upDot,
      frontDot: raw.frontDot,
      confidence: raw.confidence,
      ambiguous: raw.ambiguous,
    };

    const previous = this._lastFaces;
    const previousUp = raw.candidates.find((item) => item.face === previous.upFace);
    const previousFront = raw.candidates.find((item) => item.face === previous.frontFace);

    if (
      previousUp
      && previousFront
      && previousUp.face !== previousFront.face
      && previousUp.upDot >= 0.2
      && previousFront.frontDot >= 0.2
    ) {
      const previousScore = previousUp.upDot + previousFront.frontDot;
      const candidateScore = candidate.upDot + candidate.frontDot;
      const stillCloseToPrevious = candidateScore - previousScore < this._faceSwitchMargin;

      if (stillCloseToPrevious && (candidate.upFace !== previous.upFace || candidate.frontFace !== previous.frontFace)) {
        return {
          upFace: previous.upFace,
          frontFace: previous.frontFace,
          upDot: previousUp.upDot,
          frontDot: previousFront.frontDot,
          confidence: Math.max(0, Math.min(1, previousScore / 2)),
          ambiguous: previousUp.upDot < 0.25 || previousFront.frontDot < 0.25,
        };
      }
    }

    return candidate;
  }
}
