import * as THREE from 'three';
import { HEX_COLORS } from './colors.js';
import { CameraRig } from './CameraRig.js';
import { detectOrientationFaces } from './orientationDetection.js';

// Three.js 渲染层：负责场景、光照、相机与层扭转动画。
// 相机模型：cameraRig 位于魔方中心，相机作为其子节点。
// - 旋转只改 rig 四元数；
// - 平移只改相机局部 x/y；
// - 缩放只改相机局部 z。
// 这样平移后仍围绕魔方中心旋转，XYZ 参考线也固定在世界原点。
export class CubeRenderer {
  constructor(container) {
    this.container = container;
    this.turning = false;
    this.turnDuration = 180;
    this.lastError = null;
    this._errorLogged = false;
    this.meshes = new Map();
    this._viewChangeHandlers = new Set();
    this._lastViewFacesKey = '';

    this.cameraRig = new CameraRig({
      yaw: 0,
      pitch: 0,
      distance: 10,
      minDistance: 4.5,
      maxDistance: 24,
      pivot: new THREE.Vector3(0, 0, 0),
    });
    this.cameraRigGroup = new THREE.Group();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181b22);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.cameraRigGroup.add(this.camera);
    this.scene.add(this.cameraRigGroup);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.domElement = this.renderer.domElement;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.domElement);

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    this._setupLights();
    this._setupAxes();
    this._setupControls();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();
    requestAnimationFrame(() => this._onResize());
    this._updateCamera();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.05);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(7, 10, 8);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.75);
    fill.position.set(-6, -3, -6);
    this.scene.add(fill);
  }

  // XYZ 参考轴线，帮助判断平移是否生效。
  _setupAxes() {
    this.axesGroup = new THREE.Group();
    const length = 3;
    const makeLine = (from, to, color) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 });
      return new THREE.Line(geometry, material);
    };
    this.axesGroup.add(makeLine(new THREE.Vector3(-length, 0, 0), new THREE.Vector3(length, 0, 0), 0xff5555));
    this.axesGroup.add(makeLine(new THREE.Vector3(0, -length, 0), new THREE.Vector3(0, length, 0), 0x55ff55));
    this.axesGroup.add(makeLine(new THREE.Vector3(0, 0, -length), new THREE.Vector3(0, 0, length), 0x5588ff));
    this.scene.add(this.axesGroup);
    this.axesVisible = true;
  }

  setAxesVisible(visible) {
    this.axesVisible = Boolean(visible);
    this.axesGroup.visible = this.axesVisible;
  }

  setTurnDuration(milliseconds) {
    this.turnDuration = Math.max(40, Math.min(800, Number(milliseconds) || 180));
  }

  // 监听视角变化。当前用于“方向模拟”模式：
  // 用户拖动相机时，用固定 XYZ 判断当前哪面朝上、哪面朝向用户。
  onViewChange(handler) {
    this._viewChangeHandlers.add(handler);
    return () => this._viewChangeHandlers.delete(handler);
  }

  // 根据当前相机位置和固定世界坐标，模拟“这块魔方现在哪面朝上、哪面朝前”。
  // 魔方本身仍在世界原点，XYZ 参考线也不动；相机绕它旋转时，朝向判断随之更新。
  getSimulatedViewFaces() {
    // 屏幕朝前的方向 = 相机局部 +Z 变换到世界；
    // 屏幕朝上的方向 = 相机局部 +Y 变换到世界。
    // 这样无论怎么平移，判断只依赖视角，不依赖相机与魔方中心的连线。
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(this.cameraRig.rigQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cameraRig.rigQuaternion);

    return detectOrientationFaces(
      new THREE.Quaternion(),
      up,
      front,
    );
  }

  // 重置为默认视角，并清空平移；供“方向模拟”重新校准屏幕朝向。
  resetView() {
    this.cameraRig.yaw = 0;
    this.cameraRig.pitch = 0;
    this.cameraRig.distance = 10;
    this.cameraRig.resetPan();
    this._fitToCube();
    this._updateCamera();
  }

  _setupControls() {
    const dom = this.domElement;
    const pointers = new Map();
    let lastSingle = null;
    let lastPinch = null;

    const midpoint = () => {
      const points = [...pointers.values()];
      return {
        x: points.reduce((sum, pointer) => sum + pointer.x, 0) / points.length,
        y: points.reduce((sum, pointer) => sum + pointer.y, 0) / points.length,
      };
    };

    const pinchDistance = () => {
      const points = [...pointers.values()];
      const [a, b] = points;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    dom.addEventListener('pointerdown', (event) => {
      dom.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
        button: event.button,
      });

      if (pointers.size === 1) {
        lastSingle = { x: event.clientX, y: event.clientY, type: event.pointerType, button: event.button };
      } else if (pointers.size === 2) {
        lastPinch = { mid: midpoint(), dist: pinchDistance() };
      }
    });

    dom.addEventListener('pointermove', (event) => {
      if (!pointers.has(event.pointerId)) return;
      const stored = pointers.get(event.pointerId);
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
        button: stored.button,
      });

      if (pointers.size === 1) {
        const pointer = pointers.values().next().value;
        if (lastSingle) {
          const dx = pointer.x - lastSingle.x;
          const dy = pointer.y - lastSingle.y;
          // 触屏单指 / 鼠标左键 = 旋转；鼠标右键/中键 = 平移。
          const isRotate = pointer.type === 'touch' || pointer.button === 0;
          if (isRotate) {
            this.cameraRig.yaw -= dx * 0.005;
            // 不限制俯仰角：允许绕过顶部/底部继续旋转，避免红色/橙色面朝用户时卡住。
            this.cameraRig.pitch += dy * 0.005;
          } else {
            this._panBy(dx, dy);
          }
        }
        lastSingle = { x: pointer.x, y: pointer.y, type: pointer.type, button: pointer.button };
      } else if (pointers.size === 2) {
        const mid = midpoint();
        const dist = pinchDistance();
        if (lastPinch) {
          this._panBy(mid.x - lastPinch.mid.x, mid.y - lastPinch.mid.y);
          if (lastPinch.dist > 0 && dist > 0) {
            this.cameraRig.zoomBy(lastPinch.dist / dist);
          }
        }
        lastPinch = { mid, dist };
      }
    });

    const removePointer = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size === 1) {
        const pointer = pointers.values().next().value;
        lastSingle = { x: pointer.x, y: pointer.y, type: pointer.type, button: pointer.button };
        lastPinch = null;
      } else if (pointers.size === 0) {
        lastSingle = null;
        lastPinch = null;
      } else if (pointers.size >= 2) {
        lastPinch = { mid: midpoint(), dist: pinchDistance() };
      }
    };
    dom.addEventListener('pointerup', removePointer);
    dom.addEventListener('pointercancel', removePointer);
    dom.addEventListener('contextmenu', (event) => event.preventDefault());

    dom.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.cameraRig.zoomBy(1 + event.deltaY * 0.001);
    }, { passive: false });

    dom.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
    dom.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  }

  _panBy(dx, dy) {
    this.cameraRig.panByPixels(
      dx,
      dy,
      this.camera.fov,
      this.domElement.clientHeight || 1,
    );
  }

  _updateCamera() {
    this.cameraRig.update();
    this.cameraRigGroup.position.copy(this.cameraRig.pivot);
    this.cameraRigGroup.quaternion.copy(this.cameraRig.rigQuaternion);
    this.camera.position.copy(this.cameraRig.cameraLocalPosition);
    this.camera.quaternion.identity();
    this.cameraRigGroup.updateMatrixWorld(true);
    this._emitViewChange();
  }

  _emitViewChange() {
    const faces = this.getSimulatedViewFaces();
    const key = `${faces.upFace}|${faces.frontFace}|${faces.upDot.toFixed(4)}|${faces.frontDot.toFixed(4)}`;
    if (key === this._lastViewFacesKey) return;
    this._lastViewFacesKey = key;

    for (const handler of this._viewChangeHandlers) {
      handler(faces);
    }
  }

  // 根据模型重建全部小方块网格（配色变化或重置后调用）
  rebuild(model) {
    for (const mesh of this.meshes.values()) {
      this.cubeGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.forEach((material) => material.dispose());
    }
    this.meshes.clear();

    for (const cubie of model.cubies) {
      const materials = cubie.colors.map((name) => {
        const isInner = name === 'inner';
        return new THREE.MeshStandardMaterial({
          color: isInner ? HEX_COLORS.inner : HEX_COLORS[name],
          roughness: isInner ? 0.9 : 0.25,
          metalness: isInner ? 0.05 : 0.02,
        });
      });

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, 0.96), materials);
      mesh.userData.cubieId = cubie.id;
      this.cubeGroup.add(mesh);
      this.meshes.set(cubie.id, mesh);
    }

    this.sync(model);
  }

  // 把模型状态同步到网格的 position / quaternion
  sync(model) {
    for (const cubie of model.cubies) {
      const mesh = this.meshes.get(cubie.id);
      if (!mesh) continue;
      mesh.position.copy(cubie.pos);
      mesh.quaternion.copy(cubie.orient);
    }
  }

  // 播放一次层扭转动画；动画结束后再提交逻辑状态。
  turn(model, face, dir = 1) {
    if (this.turning) return Promise.resolve(false);
    this.turning = true;

    const info = model.computeTurn(face, dir);
    const pivot = new THREE.Group();
    this.scene.add(pivot);
    pivot.position.copy(this.cameraRig.pivot);

    const moved = new Map();
    for (const cubie of info.affected) {
      const mesh = this.meshes.get(cubie.id);
      if (!mesh) continue;
      this.cubeGroup.remove(mesh);
      pivot.add(mesh);
      moved.set(cubie.id, mesh);
    }

    const duration = this.turnDuration;
    const start = performance.now();

    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.quaternion.setFromAxisAngle(info.meta.axis, info.angle * eased);

        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }

        model.applyTurn(face, dir);

        for (const cubie of model.cubies) {
          const mesh = this.meshes.get(cubie.id);
          if (!mesh || !moved.has(cubie.id)) continue;
          if (mesh.parent === pivot) pivot.remove(mesh);
          this.cubeGroup.add(mesh);
        }

        this.scene.remove(pivot);
        this.sync(model);
        this.turning = false;
        resolve(true);
      };

      requestAnimationFrame(step);
    });
  }

  _onResize() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this._fitToCube();
    this._updateCamera();
  }

  _fitToCube() {
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const cubeRadius = 1.65;
    const limit = Math.min(Math.tan(verticalFov / 2), Math.tan(horizontalFov / 2));
    this.cameraRig.minDistance = Math.max(4.5, cubeRadius / limit);
    this.cameraRig.maxDistance = this.cameraRig.minDistance * 4;
    this.cameraRig.clampDistance();
  }

  _loop() {
    requestAnimationFrame(this._loop);
    try {
      this._updateCamera();
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.lastError = error;
      if (!this._errorLogged) {
        this._errorLogged = true;
        console.error('[CubeRenderer] 渲染循环错误：', error);
      }
    }
  }
}
