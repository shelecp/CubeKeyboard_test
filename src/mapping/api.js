import { CubeModel } from '../cube/CubeModel.js';
import { CubeRenderer } from '../cube/CubeRenderer.js';
import { PoseDetector } from '../cube/pose.js';
import { deriveFaceColors } from '../cube/colors.js';
import { resolveRelativeTurn, resolveKeymap } from '../cube/orientationMap.js';
import { RuleEngine } from './ruleEngine.js';
import { EventEmitter } from '../utils/emitter.js';
import { normalizeFace, normalizeMove } from './notation.js';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { loadConfig as loadStoredConfig, saveConfig, parseConfig } from './config.js';

// 当前只使用 WebGL 渲染。Canvas 2D 兜底列为后续预留，不在本版本实现。
function createRenderer(container) {
  return { renderer: new CubeRenderer(container), isWebGL: true };
}

// 创建并返回 window.CubeKeyboard 实例。
// 这里暴露一组稳定接口，后续可让大模型直接调用这些函数来修改自定义逻辑。
export function createCubeKeyboard({ container }) {
  const model = new CubeModel();
  const { renderer, isWebGL } = createRenderer(container);
  const pose = new PoseDetector();
  const engine = new RuleEngine();
  const events = new EventEmitter();

  renderer.rebuild(model);

  // 规则引擎的 output / turnschange 事件转发到对外事件总线
  engine.events.on('output', (result) => events.emit('output', result.output));
  engine.events.on('turnschange', (buffer) => events.emit('turnschange', buffer));

  const api = {};
  let config = loadStoredConfig();
  let turnQueue = Promise.resolve();

  // 根据当前模式刷新参考系：
  // - manual：固定正面/顶面颜色，并在魔方中寻找这些颜色当前所在的面；
  // - simulate：在 UI 中用固定 XYZ + 当前相机视角做方向模拟。
  function refreshPose() {
    if (pose.mode === 'manual') {
      pose.updateFromTargetColors(model);
      return;
    }
    if (pose.mode === 'simulate' && typeof renderer.getSimulatedViewFaces === 'function') {
      const faces = renderer.getSimulatedViewFaces();
      if (faces) {
        pose.updateFromSimulatedView(model, faces);
        return;
      }
    }
  }

  function getCurrentFaces() {
    const info = pose.getDetectionInfo();
    if (info?.frontFace && info?.upFace) {
      return { frontFace: info.frontFace, upFace: info.upFace };
    }
    return { frontFace: 'front', upFace: 'up' };
  }

  // CubeRenderer 的相机视角变化时，如果处于方向模拟模式，就更新正面/顶面。
  if (typeof renderer.onViewChange === 'function') {
    renderer.onViewChange(() => {
      if (pose.mode !== 'simulate') return;
      refreshPose();
      events.emit('referencechange', pose.getReference());
    });
  }

  // 应用配置：更新参考系、配色、规则，并重建魔方（配色变更视为复原）
  function applyConfig(nextConfig) {
    config = nextConfig;
    api.config = config;
    pose.setReference(config.reference);
    model.setFaceColors(deriveFaceColors(config.reference));
    renderer.rebuild(model);
    renderer.setTurnDuration?.(config.turnDurationMs ?? 180);
    engine.load(config);
    refreshPose();
    saveConfig(config);
    events.emit('configchange', config);
  }

  // 执行一次层扭转，返回 Promise<boolean>（忙时返回 false）
  function turn(face, dir = 1) {
    // 串行排队：快速连按时不丢步骤，逐个播放扭转动画
    const run = () => renderer.turn(model, face, dir).then((ok) => {
      if (ok) {
        engine.onTurn(face, dir);
        events.emit('statechange', model.serialize());
        refreshPose();
        events.emit('referencechange', pose.getReference());
      }
      return ok;
    });
    turnQueue = turnQueue.then(run, run);
    return turnQueue;
  }

  // 执行一次“用户视角”的层扭转：
  // 键盘 E/A/S/D/F/C 始终表示当前顶面/左面/正面/右面/背面/底面，
  // 参考系变化后，这里会把逻辑面解析成实际世界面。
  function turnRelative(face, dir = 1) {
    const logicalFace = normalizeFace(face);
    const current = getCurrentFaces();
    const resolved = resolveRelativeTurn(
      logicalFace,
      dir,
      current.frontFace,
      current.upFace,
    );

    const run = () => renderer.turn(model, resolved.face, resolved.dir).then((ok) => {
      if (ok) {
        engine.onTurn(resolved.logicalFace, dir);
        events.emit('statechange', model.serialize());
        refreshPose();
        events.emit('referencechange', pose.getReference());
      }
      return ok;
    });
    turnQueue = turnQueue.then(run, run);
    return turnQueue;
  }

  // 解析标准记法：'F' / "F'" / 'F2'
  function applyMove(notation) {
    const move = normalizeMove(notation);
    return turn(move.face, move.dir);
  }

  Object.assign(api, {
    model,
    renderer,
    isWebGL,
    rendererType: 'webgl',
    pose,
    engine,
    config,

    // 配置读写
    applyConfig,
    loadConfig(input) {
      applyConfig(parseConfig(input));
    },
    resetConfig() {
      pose.setMode('manual');
      applyConfig(structuredClone(DEFAULT_CONFIG));
      return structuredClone(config);
    },
    exportConfig() {
      return structuredClone(config);
    },
    saveConfig() {
      saveConfig(config);
    },
    setTurnDuration(milliseconds) {
      config.turnDurationMs = Math.max(40, Math.min(800, Number(milliseconds) || 180));
      renderer.setTurnDuration?.(config.turnDurationMs);
      saveConfig(config);
      events.emit('configchange', config);
      return config.turnDurationMs;
    },

    // 规则管理
    registerRule(rule) {
      engine.registerRule(rule);
      config.rules = engine.listRules();
      saveConfig(config);
      events.emit('configchange', config);
    },
    removeRule(id) {
      engine.removeRule(id);
      config.rules = engine.listRules();
      saveConfig(config);
      events.emit('configchange', config);
    },
    listRules() {
      return engine.listRules();
    },
    registerStickerMap(map) {
      engine.registerStickerMap(map);
      config.stickerMaps = engine.listStickerMaps();
      saveConfig(config);
      events.emit('configchange', config);
    },
    removeStickerMap(id) {
      engine.removeStickerMap(id);
      config.stickerMaps = engine.listStickerMaps();
      saveConfig(config);
      events.emit('configchange', config);
    },
    listStickerMaps() {
      return engine.listStickerMaps();
    },

    // 九宫格贴纸触发与编辑
    triggerSticker(face, cell) {
      const result = engine.triggerSticker(face, cell);
      if (result) events.emit('output', result.output);
      return result ? result.output : null;
    },
    setStickerCell(face, row, col, output) {
      engine.setStickerCell(normalizeFace(face), row, col, output);
      config.stickerMaps = engine.listStickerMaps();
      saveConfig(config);
      events.emit('configchange', config);
    },
    clearStickerCell(face, row, col) {
      engine.setStickerCell(normalizeFace(face), row, col, null);
      config.stickerMaps = engine.listStickerMaps();
      saveConfig(config);
      events.emit('configchange', config);
    },

    // 参考系与朝向
    setReference(reference) {
      applyConfig({ ...config, reference: { ...config.reference, ...reference } });
    },
    setPoseDetectorMode(mode) {
      const normalized = mode === 'gyro' ? 'simulate' : mode;
      pose.setMode(normalized);
      if (pose.mode === 'manual') {
        pose.setReference(config.reference);
      }
      refreshPose();
      events.emit('referencechange', pose.getReference());
      return pose.mode;
    },
    getPoseReference() {
      return pose.getReference();
    },
    getPoseDetection() {
      return pose.getDetectionInfo();
    },
    resetView() {
      renderer.resetView?.();
      refreshPose();
      events.emit('referencechange', pose.getReference());
    },
    // 方便在没有真实设备方向事件的电脑上做方向判定测试。
    // 传入 THREE.Quaternion 或兼容 {x,y,z,w} 的对象均可。
    setOrientationForTesting(quaternion) {
      pose.orientation = quaternion;
      if (pose.mode === 'simulate') {
        pose.detectFromOrientation(model, quaternion);
      } else {
        pose.updateFromTargetColors(model);
      }
      events.emit('referencechange', pose.getReference());
      return pose.getDetectionInfo();
    },

    // 魔方操作
    turn,
    applyMove,
    turnRelative,
    resolveRelativeTurn(face, dir = 1) {
      const current = getCurrentFaces();
      return resolveRelativeTurn(
        normalizeFace(face),
        dir,
        current.frontFace,
        current.upFace,
      );
    },
    getResolvedKeymap() {
      const current = getCurrentFaces();
      return resolveKeymap(config.keymap, current.frontFace, current.upFace);
    },
    resetCube() {
      turnQueue = Promise.resolve();
      model.reset();
      renderer.sync(model);
      engine.clearTurns();
      events.emit('statechange', model.serialize());
      refreshPose();
      events.emit('referencechange', pose.getReference());
    },

    // 事件订阅
    on(type, callback) {
      events.on(type, callback);
      return () => events.off(type, callback);
    },
    emit(type, payload) {
      events.emit(type, payload);
    },
  });

  applyConfig(config);

  // 暴露一个轻量记法帮助（方便控制台/大模型查阅）
  api.NOTATION = {
    clockwise: 'F / B / U / D / L / R',
    counterClockwise: "F' / B' / U' / D' / L' / R'",
    halfTurn: 'F2 / B2 / U2 / D2 / L2 / R2',
    example: "CubeKeyboard.applyMove(\"F\")",
  };

  return api;
}
