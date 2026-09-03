import { CubeModel } from '../cube/CubeModel.js';
import { CubeRenderer } from '../cube/CubeRenderer.js';
import { PoseDetector } from '../cube/pose.js';
import { deriveFaceColors } from '../cube/colors.js';
import { resolveRelativeTurn, resolveKeymap } from '../cube/orientationMap.js';
import { RuleEngine } from './ruleEngine.js';
import { EventEmitter } from '../utils/emitter.js';
import { normalizeFace, normalizeMove, normalizeSequence } from './notation.js';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { loadConfig as loadStoredConfig, saveConfig, parseConfig } from './config.js';

// 当前只使用 WebGL 渲染。Canvas 2D 兜底列为后续预留，不在本版本实现。
function createRenderer(container) {
  return { renderer: new CubeRenderer(container), isWebGL: true };
}

function normalizeOutputSafe(output) {
  if (typeof output === 'string') return output;
  if (output && typeof output.text === 'string') return output.text;
  return '';
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
  // 暂停规则引擎（九宫格模式 / 规则录制中）：扭转只旋转、不吐字、不进缓冲
  let engineSuspended = false;

  // 当前输入法的规则表（按 profile 分表存储，切换输入法即切换表）
  function currentRulesTable() {
    const id = config.activeIme || 'pinyin26';
    if (!Array.isArray(config.imeRules[id])) config.imeRules[id] = [];
    return config.imeRules[id];
  }

  function persistRules() {
    currentRulesTable().splice(0, currentRulesTable().length, ...engine.listRules());
    saveConfig(config);
    events.emit('configchange', config);
  }

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
    engine.load({ rules: currentRulesTable() });
    refreshPose();
    saveConfig(config);
    events.emit('configchange', config);
  }

  // 执行一次层扭转，返回 Promise<boolean>（忙时返回 false）
  function turn(face, dir = 1) {
    // 串行排队：快速连按时不丢步骤，逐个播放扭转动画
    const run = () => renderer.turn(model, face, dir).then((ok) => {
      if (ok) {
        events.emit('turn', { face, dir, logical: false });
        if (!engineSuspended) engine.onTurn(face, dir);
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
  // 键盘 R/A/S/D/F/V 始终表示当前顶面/左面/正面/右面/背面/底面，
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
        events.emit('turn', { face: logicalFace, dir, logical: true });
        if (!engineSuspended) engine.onTurn(resolved.logicalFace, dir);
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

    // 规则管理（作用于当前输入法的规则表）
    registerRule(rule) {
      engine.registerRule(rule);
      persistRules();
    },
    removeRule(id) {
      engine.removeRule(id);
      persistRules();
    },
    listRules() {
      return engine.listRules();
    },
    // 重置某个输入法的扭转规则表为其 profile 默认表；不传 id 则重置当前输入法。
    resetImeRules(id, defaultRules) {
      const target = id || config.activeIme || 'pinyin26';
      config.imeRules[target] = structuredClone(Array.isArray(defaultRules) ? defaultRules : []);
      if (target === config.activeIme) {
        engine.load({ rules: currentRulesTable() });
      }
      saveConfig(config);
      events.emit('configchange', config);
    },
    // 导出当前输入法的扭转规则（带输入法标识，导入时校验匹配）
    exportImeRules() {
      return {
        type: 'cube-keyboard-ime-rules',
        version: 1,
        ime: config.activeIme || 'pinyin26',
        rules: engine.listRules(),
      };
    },
    // 导入指定输入法的扭转规则；返回 { ok, message }
    importImeRules(payload, knownImes) {
      if (!payload || payload.type !== 'cube-keyboard-ime-rules' || !Array.isArray(payload.rules)) {
        return { ok: false, message: '文件不是有效的“输入法扭转规则”导出文件' };
      }
      const ime = payload.ime;
      if (!ime || !knownImes.includes(ime)) {
        return { ok: false, message: `文件里的输入法标识「${ime || '未知'}」不存在` };
      }
      if (ime !== config.activeIme) {
        const currentName = (knownImes.find((x) => x === config.activeIme) || config.activeIme);
        return {
          ok: false,
          mismatch: true,
          message: `该规则表属于「${ime}」，与当前输入法「${currentName}」不匹配，请先切换到「${ime}」再导入`,
        };
      }
      try {
        // 逐条校验记法合法性（不合法直接抛错），再整体替换该输入法的规则表
        const normalized = payload.rules.map((rule, index) => {
          const copy = { ...rule, id: rule.id || `imported-${index}`, type: 'turn-sequence' };
          normalizeSequence(copy.when);
          if (normalizeOutputSafe(copy.output) === '') throw new Error(`第 ${index + 1} 条规则缺少输出`);
          return copy;
        });
        config.imeRules[ime] = normalized;
        if (ime === config.activeIme) engine.load({ rules: normalized });
        saveConfig(config);
        events.emit('configchange', config);
        return { ok: true, message: `已导入「${ime}」的 ${normalized.length} 条扭转规则` };
      } catch (error) {
        engine.load({ rules: currentRulesTable() });
        return { ok: false, message: `导入失败：${error.message}` };
      }
    },

    // 输入法 profile 切换：id 对应 src/configs/ime/*.json。
    // defaultRules 由调用方（panels.js）从 profile 传入，作为该输入法首次使用的兜底表。
    activateProfile(id, defaultRules = []) {
      config.activeIme = id;
      const table = config.imeRules[id];
      if (!Array.isArray(table) || table.length === 0) {
        config.imeRules[id] = structuredClone(defaultRules);
      }
      engine.load({ rules: currentRulesTable() });
      engineSuspended = false;
      saveConfig(config);
      events.emit('configchange', config);
    },
    getActiveProfile() {
      return config.activeIme;
    },
    // 暂停/恢复规则引擎（九宫格模式、规则录制期间使用）
    setEngineSuspended(suspended) {
      engineSuspended = Boolean(suspended);
      if (engineSuspended) engine.clearTurns();
      return engineSuspended;
    },
    isEngineSuspended() {
      return engineSuspended;
    },

    // 格子文字（贴纸唯一编号 → 文字）：模拟触摸与编辑模式的数据源
    setCellText(cellId, text) {
      if (!model.cellOwner.has(cellId)) throw new Error(`未知的格子编号：${cellId}`);
      const value = String(text ?? '');
      if (value) config.cells[cellId] = value;
      else delete config.cells[cellId];
      renderer.setStickerText(cellId, value);
      events.emit('cellschange', { ...config.cells });
    },
    clearCellText(cellId) {
      this.setCellText(cellId, '');
    },
    getCellText(cellId) {
      return config.cells[cellId] ?? '';
    },
    listCells() {
      return { ...config.cells };
    },
    listCellIds() {
      return [...model.cellOwner.keys()];
    },
    // 编辑模式的"总保存"：把全部格子文字与配置写入 localStorage
    saveCells() {
      saveConfig(config);
      events.emit('cellssaved', { ...config.cells });
    },
    // 点击魔方上的格子，输出其文字（模拟触摸）
    triggerCell(cellId) {
      const text = config.cells[cellId];
      if (!text) return null;
      events.emit('output', text);
      return text;
    },
    // 把 config.cells 应用到 3D 贴纸文字（普通模式下调用；九宫格模式有自己的键位显示）
    applyCellsToRenderer() {
      renderer.clearAllStickerTexts();
      for (const [cellId, text] of Object.entries(config.cells)) {
        renderer.setStickerText(cellId, text);
      }
    },
    clearStickerTexts() {
      renderer.clearAllStickerTexts();
    },
    setStickerText(cellId, text) {
      renderer.setStickerText(cellId, text);
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
