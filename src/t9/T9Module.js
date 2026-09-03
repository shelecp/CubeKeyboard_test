// 九宫格模式（完全独立的实验模块，与输入法体系无关）：
// - 由页面右上角的「九宫格模式」按钮开关（按钮在模块缺失时自动隐藏）；
// - 输入方式：两次旋转（一次横向层 U/E/D + 一次纵向层 L/M/R，不分先后、不分顺逆）
//   在当前正面上的交点即唯一格子，直接输出该格的九键字符；
// - 正面由"方向模拟"（相机视角）自动判定；魔方旋转/换面后，9 个键位文字实时跟随新正面；
// - 开启时侧边栏强制收起且不可展开、规则引擎暂停、贴纸文字隐藏；
// - 删除本目录（src/t9/）不影响任何其他功能（九键拼音输入法在 src/ime/，不受影响）。
import { createT9Engine } from '../ime/t9Engine.js';
import t9Dict from '../ime/t9-dict.json';

// 键位副字母（贴纸上显示为"大数字 + 小字母"）
const KEY_SUB = {
  1: '',
  2: 'abc',
  3: 'def',
  4: 'ghi',
  5: 'jkl',
  6: 'mno',
  7: 'pqrs',
  8: 'tuv',
  9: 'wxyz',
};

// 横向层决定行（U=顶行 E=中行 D=底行），纵向层决定列（L/M/R）
const ROW_FACES = { U: 0, E: 1, D: 2 };
const COL_FACES = { L: 0, M: 1, R: 2 };

const WORLD_NORMALS = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  up: [0, 1, 0],
  down: [0, -1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

export function createT9Module({ cubeKeyboard, imeBar, profile }) {
  const engine = createT9Engine(t9Dict.syllables);
  let savedPoseMode = null;
  let pendingRow = null;
  let pendingCol = null;
  const unsubs = [];

  // 当前正面（世界面）的 3×3 格子 → 贴纸唯一编号
  function frontGrid() {
    const info = cubeKeyboard.pose.getDetectionInfo?.() || {};
    const frontName = info.frontFace || 'front';
    const upName = info.upFace || 'up';
    const f = WORLD_NORMALS[frontName] || WORLD_NORMALS.front;
    const u = WORLD_NORMALS[upName] || WORLD_NORMALS.up;
    const right = [
      u[1] * f[2] - u[2] * f[1],
      u[2] * f[0] - u[0] * f[2],
      u[0] * f[1] - u[1] * f[0],
    ];

    const grid = [];
    for (let row = 0; row < 3; row += 1) {
      const line = [];
      for (let col = 0; col < 3; col += 1) {
        const pos = {
          x: f[0] + u[0] * (1 - row) + right[0] * (col - 1),
          y: f[1] + u[1] * (1 - row) + right[1] * (col - 1),
          z: f[2] + u[2] * (1 - row) + right[2] * (col - 1),
        };
        const hit = cubeKeyboard.model.stickerAt(pos, frontName);
        line.push(hit?.cellId ?? null);
      }
      grid.push(line);
    }
    return grid;
  }

  // 9 个键位文字跟随当前正面实时刷新
  function refreshLabels() {
    cubeKeyboard.clearStickerTexts();
    const grid = frontGrid();
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const cellId = grid[row][col];
        if (!cellId) continue;
        const digit = String(row * 3 + col + 1);
        cubeKeyboard.setStickerText(cellId, `${digit}${KEY_SUB[digit]}`);
      }
    }
  }

  function updateBar() {
    imeBar.setComposition(engine.composition());
    imeBar.showCandidates(engine.candidates());
  }

  // 两次旋转定位格子：不分先后、不分顺逆；同轴连转以最后一次为准；F/B 不参与定位
  function onTurn({ face, logical }) {
    if (!logical) return;
    if (face in ROW_FACES) pendingRow = ROW_FACES[face];
    else if (face in COL_FACES) pendingCol = COL_FACES[face];
    if (pendingRow === null || pendingCol === null) return;

    const digit = String(pendingRow * 3 + pendingCol + 1);
    pendingRow = null;
    pendingCol = null;
    engine.press(digit);
    updateBar();
  }

  function activate() {
    savedPoseMode = cubeKeyboard.pose.mode;
    if (savedPoseMode !== 'simulate') cubeKeyboard.setPoseDetectorMode('simulate');

    cubeKeyboard.clearStickerTexts();
    refreshLabels();
    imeBar.reset();
    imeBar.setStatus(profile.name);
    imeBar.onCandidate = (char) => {
      if (engine.choose(char)) imeBar.commit(char);
      updateBar();
    };
    imeBar.onBackspace = () => {
      engine.backspace();
      updateBar();
    };
    imeBar.onClear = () => {
      engine.clear();
      imeBar.clearOutput();
      updateBar();
    };

    unsubs.push(cubeKeyboard.on('turn', onTurn));
    unsubs.push(cubeKeyboard.on('statechange', refreshLabels));
    unsubs.push(cubeKeyboard.on('referencechange', refreshLabels));
  }

  function deactivate() {
    for (const off of unsubs) off();
    unsubs.length = 0;
    if (savedPoseMode && cubeKeyboard.pose.mode !== savedPoseMode) {
      cubeKeyboard.setPoseDetectorMode(savedPoseMode);
    }
    cubeKeyboard.applyCellsToRenderer();
    imeBar.reset();
  }

  return { activate, deactivate };
}
