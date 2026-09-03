import * as THREE from 'three';
import { HEX_COLORS } from './colors.js';
import { CameraRig } from './CameraRig.js';
import { detectOrientationFaces } from './orientationDetection.js';

// 材质槽位（+X、-X、+Y、-Y、+Z、-Z）→ 覆层的局部朝向与偏移
const FACE_PLACEMENT = [
  { normal: [1, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { normal: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { normal: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0] },
  { normal: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },
  { normal: [0, 0, 1], rotation: [0, 0, 0] },
  { normal: [0, 0, -1], rotation: [0, Math.PI, 0] },
];
const FACE_OFFSET = 0.482;

function luminanceOf(hex) {
  const value = hex ?? 0x888888;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

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

    // —— 贴纸文字 / 拾取 / 焦点高亮 ——
    this.model = null;
    this.textOverlays = new Map(); // cellId -> 覆层 Mesh
    this.raycaster = new THREE.Raycaster();
    this.pickEnabled = true;
    this.hoveredCellId = null;
    this.highlightMesh = null;
    this.highlightTime = 0;
    this.cellHoverHandler = null;
    this.cellClickHandler = null;
    this._pickPending = false;
    this._lastPickPos = null;

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
    // 点击 vs 拖拽判定：按下位置/时间，手势期间出现过多指针则不算点击
    let clickCandidate = null;
    let gestureMaxPointers = 0;

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
      gestureMaxPointers = Math.max(gestureMaxPointers, pointers.size);

      if (pointers.size === 1) {
        lastSingle = { x: event.clientX, y: event.clientY, type: event.pointerType, button: event.button };
        clickCandidate = {
          x: event.clientX,
          y: event.clientY,
          time: performance.now(),
          button: event.button,
          pointerType: event.pointerType,
          pointerId: event.pointerId,
        };
      } else if (pointers.size === 2) {
        lastPinch = { mid: midpoint(), dist: pinchDistance() };
      }
    });

    // 悬停焦点：仅在未按下任何指针时跟随鼠标
    dom.addEventListener('pointermove', (event) => {
      if (pointers.size > 0) {
        this._setHovered(null);
        return;
      }
      this._scheduleHoverPick(event);
    });
    dom.addEventListener('pointerleave', () => this._setHovered(null));

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

      // 点击判定：左键/单指、位移小于 6px、时长小于 500ms、手势期间未出现多指
      if (clickCandidate
        && clickCandidate.pointerId === event.pointerId
        && gestureMaxPointers === 1
        && (clickCandidate.button === 0 || clickCandidate.pointerType === 'touch')) {
        const moved = Math.hypot(event.clientX - clickCandidate.x, event.clientY - clickCandidate.y);
        const elapsed = performance.now() - clickCandidate.time;
        if (moved < 6 && elapsed < 500) {
          const pick = this.pickEnabled ? this._pickAt(event) : null;
          if (pick) this.cellClickHandler?.(pick);
        }
      }
      clickCandidate = null;
      if (pointers.size === 0) gestureMaxPointers = 0;

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
    // 阻止右键菜单；并尽量阻止浏览器/扩展把"右键拖动"识别为鼠标手势。
    dom.addEventListener('contextmenu', (event) => event.preventDefault());
    dom.addEventListener('mousedown', (event) => {
      if (event.button === 2) event.preventDefault();
    });

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
      this._disposeChildren(mesh);
      this.cubeGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.forEach((material) => material.dispose());
    }
    this.meshes.clear();
    this.textOverlays.clear();
    this.highlightMesh = null;
    this.hoveredCellId = null;
    this.model = model;

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

  _disposeChildren(mesh) {
    for (const child of [...mesh.children]) {
      mesh.remove(child);
      child.geometry?.dispose();
      child.material?.map?.dispose();
      child.material?.dispose();
    }
  }

  // ---------- 贴纸文字（模拟触摸 / 编辑模式 / 九宫格键位共用） ----------

  // 在某个贴纸上显示文字；text 为空表示清除。
  // "2abc" 形式会被解析为大数字 + 小字母（九宫格键位样式）。
  setStickerText(cellId, text) {
    if (!this.model) return;
    const content = String(text ?? '').trim();
    if (!content) {
      this.clearStickerText(cellId);
      return;
    }

    const cubie = this.model.cellOwner.get(cellId);
    if (!cubie) return;
    const mesh = this.meshes.get(cubie.id);
    if (!mesh) return;
    const materialIndex = Number(
      Object.entries(cubie.cellIds || {}).find(([, id]) => id === cellId)?.[0] ?? NaN,
    );
    if (!Number.isInteger(materialIndex)) return;

    let overlay = this.textOverlays.get(cellId);
    if (!overlay) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      overlay = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), material);
      overlay.renderOrder = 2;
      overlay.raycast = () => {};
      this.textOverlays.set(cellId, overlay);
    }

    if (overlay.parent !== mesh) {
      overlay.parent?.remove(overlay);
      mesh.add(overlay);
    }

    const placement = FACE_PLACEMENT[materialIndex];
    overlay.position.set(
      placement.normal[0] * FACE_OFFSET,
      placement.normal[1] * FACE_OFFSET,
      placement.normal[2] * FACE_OFFSET,
    );
    overlay.rotation.set(...placement.rotation);

    this._drawStickerCanvas(overlay.material.map.image, cubie.colors[materialIndex], content);
    overlay.material.map.needsUpdate = true;
    overlay.visible = true;
  }

  clearStickerText(cellId) {
    const overlay = this.textOverlays.get(cellId);
    if (overlay) overlay.visible = false;
  }

  clearAllStickerTexts() {
    for (const overlay of this.textOverlays.values()) overlay.visible = false;
  }

  _drawStickerCanvas(canvas, colorName, content) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const lum = luminanceOf(HEX_COLORS[colorName]);
    const fill = lum > 0.62 ? '#20242e' : '#ffffff';
    const shadow = lum > 0.62 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 6;

    // "2abc" 形式：大数字 + 小字母（九宫格键位）
    const keyMatch = content.match(/^(\d)([a-z]+)$/);
    if (keyMatch) {
      ctx.fillStyle = fill;
      ctx.font = '700 108px system-ui, sans-serif';
      ctx.fillText(keyMatch[1], 128, 106);
      ctx.font = '600 40px system-ui, sans-serif';
      ctx.fillText(keyMatch[2], 128, 196);
      return;
    }

    // 普通文字：超长截断为前 4 字符 + …
    let display = content;
    if (display.length > 5) display = `${display.slice(0, 4)}…`;
    let fontSize = display.length <= 1 ? 120 : display.length <= 2 ? 92 : display.length <= 3 ? 72 : 58;
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    while (ctx.measureText(display).width > 226 && fontSize > 20) {
      fontSize -= 4;
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    }
    ctx.fillStyle = fill;
    ctx.fillText(display, 128, 132);
  }

  // ---------- 拾取（悬停焦点 + 点击输出） ----------

  onCellHover(handler) {
    this.cellHoverHandler = handler;
  }

  onCellClick(handler) {
    this.cellClickHandler = handler;
  }

  setPickEnabled(enabled) {
    this.pickEnabled = Boolean(enabled);
    if (!this.pickEnabled) this._setHovered(null);
  }

  _ndcFromEvent(event) {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  _pickAt(event) {
    const ndc = this._ndcFromEvent(event);
    if (!ndc) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.cubeGroup.children, false);
    const hit = hits.find((item) => item.object?.userData?.cubieId);
    if (!hit || !hit.face) return null;

    const cubieId = hit.object.userData.cubieId;
    const cubie = this.model?.cubies.find((item) => item.id === cubieId);
    const cellId = cubie?.cellIds?.[hit.face.materialIndex] ?? null;
    if (!cellId) return null;
    return { cellId, cubieId, materialIndex: hit.face.materialIndex };
  }

  _setHovered(pick) {
    const cellId = pick ? pick.cellId : null;
    if (cellId === this.hoveredCellId) return;
    this.hoveredCellId = cellId;

    if (!cellId) {
      if (this.highlightMesh) this.highlightMesh.visible = false;
    } else {
      const mesh = this.meshes.get(pick.cubieId);
      if (mesh) {
        if (!this.highlightMesh) this.highlightMesh = this._createHighlightMesh();
        if (this.highlightMesh.parent !== mesh) {
          this.highlightMesh.parent?.remove(this.highlightMesh);
          mesh.add(this.highlightMesh);
        }
        const placement = FACE_PLACEMENT[pick.materialIndex];
        this.highlightMesh.position.set(
          placement.normal[0] * FACE_OFFSET,
          placement.normal[1] * FACE_OFFSET,
          placement.normal[2] * FACE_OFFSET,
        );
        this.highlightMesh.rotation.set(...placement.rotation);
        this.highlightMesh.visible = true;
        this.highlightTime = 0;
      }
    }

    this.cellHoverHandler?.(pick);
  }

  _createHighlightMesh() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
    ctx.lineWidth = 14;
    ctx.shadowColor = 'rgba(90, 180, 255, 0.9)';
    ctx.shadowBlur = 26;
    const r = 38;
    const x = 22;
    const y = 22;
    const w = 212;
    const h = 212;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 200, 255, 0.14)';
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), material);
    mesh.renderOrder = 3;
    mesh.raycast = () => {};
    return mesh;
  }

  _scheduleHoverPick(event) {
    if (!this.pickEnabled || !this.model) return;
    this._lastPickPos = event;
    if (this._pickPending) return;
    this._pickPending = true;
    requestAnimationFrame(() => {
      this._pickPending = false;
      if (!this.pickEnabled || !this._lastPickPos) return;
      const pick = this._pickAt(this._lastPickPos);
      this._setHovered(pick);
    });
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
      // 焦点高亮呼吸动画
      if (this.highlightMesh?.visible) {
        this.highlightTime += 0.016;
        const pulse = 0.72 + Math.sin(this.highlightTime * 5) * 0.22;
        this.highlightMesh.material.opacity = pulse;
        const scale = 1 + Math.sin(this.highlightTime * 5) * 0.02;
        this.highlightMesh.scale.setScalar(scale);
      }
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
