import { COLOR_NAMES, HEX_COLORS } from '../cube/colors.js';
import { FACE_NAMES_ZH } from '../cube/CubeModel.js';
import { downloadConfig } from '../mapping/config.js';
import { moveToString } from '../mapping/notation.js';
import { ImePanel } from '../ime/ImePanel.js';

const FACE_OPTIONS = [
  { value: 'F', label: '正面' },
  { value: 'B', label: '背面' },
  { value: 'U', label: '顶面' },
  { value: 'D', label: '底面' },
  { value: 'L', label: '左面' },
  { value: 'R', label: '右面' },
];

// 组装界面交互：参考系、键盘映射、扭转规则、九宫格贴纸映射、虚拟输入法。
export function setupUI(cubeKeyboard) {
  const frontSelect = document.getElementById('front-color');
  const upSelect = document.getElementById('up-color');
  const referenceHint = document.getElementById('reference-hint');
  const refManualButton = document.getElementById('ref-manual');
  const refSimulateButton = document.getElementById('ref-simulate');
  const keysPanel = document.getElementById('keys-panel');
  const moveLog = document.getElementById('move-log');
  const resetButton = document.getElementById('reset-cube');
  const resetConfigButton = document.getElementById('reset-config');
  const exportButton = document.getElementById('export-config');
  const axesButton = document.getElementById('toggle-axes');
  const referenceDetail = document.getElementById('reference-detail');
  const resetViewButton = document.getElementById('reset-view');
  const importInput = document.getElementById('import-config');
  const turnDurationInput = document.getElementById('turn-duration');
  const turnDurationLabel = document.getElementById('turn-duration-label');
  const sidebarToggleButton = document.getElementById('sidebar-toggle');

  // 输入模式切换
  const modeSequencesButton = document.getElementById('mode-sequences');
  const modeStickerButton = document.getElementById('mode-sticker');
  const modeHint = document.getElementById('mode-hint');
  const panelRules = document.getElementById('panel-rules');
  const panelSticker = document.getElementById('panel-sticker');

  // 虚拟输入法相关元素
  const imeModeButton = document.getElementById('ime-mode');
  const imeClearButton = document.getElementById('ime-clear');
  const imeOutput = document.getElementById('ime-output');
  const imeCandidates = document.getElementById('ime-candidates');

  // 扭转规则相关元素
  const rulesList = document.getElementById('rules-list');
  const ruleSequenceInput = document.getElementById('rule-sequence');
  const ruleOutputInput = document.getElementById('rule-output');
  const ruleAddButton = document.getElementById('rule-add');

  // 九宫格贴纸映射相关元素
  const stickerFaceSelect = document.getElementById('sticker-face');
  const stickerGrid = document.getElementById('sticker-grid');
  const stickerPresetSelect = document.getElementById('sticker-preset');
  const stickerApplyPresetButton = document.getElementById('sticker-apply-preset');
  const stickerClearFaceButton = document.getElementById('sticker-clear-face');
  const stickerOutputInput = document.getElementById('sticker-output');
  const stickerSaveButton = document.getElementById('sticker-save');
  const stickerClearButton = document.getElementById('sticker-clear');

  let selectedStickerCell = null;
  let inputMode = 'sequences';
  let axesVisible = true;

  const ime = new ImePanel({
    outputEl: imeOutput,
    modeButtonEl: imeModeButton,
    candidateEl: imeCandidates,
  });

  cubeKeyboard.on('output', (output) => ime.receive(output));

  // 填充参考系颜色下拉框
  for (const color of COLOR_NAMES) {
    frontSelect.add(new Option(color, color));
    upSelect.add(new Option(color, color));
  }

  function refreshReference() {
    const reference = cubeKeyboard.pose.getReference();
    frontSelect.value = reference.front;
    upSelect.value = reference.up;
    referenceHint.innerHTML = [
      '当前：',
      `正面 <span class="ref-swatch" style="background:${colorCss(reference.front)}"></span>${reference.front}`,
      '　',
      `顶面 <span class="ref-swatch" style="background:${colorCss(reference.up)}"></span>${reference.up}`,
    ].join('');

    const info = cubeKeyboard.pose.getDetectionInfo?.();
    if (cubeKeyboard.pose.mode === 'manual') {
      referenceDetail.textContent = '手动模式：正面/顶面颜色固定，并自动跟随所选颜色当前所在的层。';
      return;
    }

    if (!info) {
      referenceDetail.textContent = '方向判定中…';
      return;
    }

    const faceName = (face) => FACE_NAMES_ZH[face?.toUpperCase()] || face || '未知';
    const confidenceText = info.confidence == null ? '' : `，置信度 ${Math.round(info.confidence * 100)}%`;
    const ambiguityText = info.ambiguous ? '，角度不够明确' : '';
    const prefix = cubeKeyboard.pose.mode === 'simulate' ? '方向模拟：' : '当前：';
    referenceDetail.textContent = `${prefix}正面=${faceName(info.frontFace)}，顶面=${faceName(info.upFace)}${confidenceText}${ambiguityText}`;
  }

  function colorCss(name) {
    const hex = HEX_COLORS[name];
    return hex == null ? '#888888' : `#${hex.toString(16).padStart(6, '0')}`;
  }

  function setReferenceMode(mode) {
    const actual = cubeKeyboard.setPoseDetectorMode(mode);
    refManualButton.classList.toggle('active', actual === 'manual');
    refSimulateButton.classList.toggle('active', actual === 'simulate');
    frontSelect.disabled = actual !== 'manual';
    upSelect.disabled = actual !== 'manual';
    resetViewButton.disabled = actual !== 'simulate';
    refreshReference();
  }

  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    sidebarToggleButton.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggleButton.setAttribute('title', collapsed ? '展开侧栏' : '收起侧栏');
    sidebarToggleButton.setAttribute('aria-label', collapsed ? '展开侧栏' : '收起侧栏');
  }

  function renderKeymap() {
    keysPanel.innerHTML = '';
    for (const [key, value] of Object.entries(cubeKeyboard.config.keymap || {})) {
      const item = document.createElement('div');
      item.className = 'key-item';

      const keycap = document.createElement('span');
      keycap.className = 'keycap';
      keycap.textContent = key.toUpperCase();

      const label = document.createElement('span');
      const resolved = cubeKeyboard.resolveRelativeTurn?.(value.face, 1) || { face: value.face };
      label.textContent = `${FACE_NAMES_ZH[value.face] || value.face} → ${FACE_NAMES_ZH[resolved.face] || resolved.face}`;

      item.append(keycap, label);
      keysPanel.appendChild(item);
    }
  }

  function logMove(line) {
    const div = document.createElement('div');
    div.className = 'log-line';
    div.textContent = line;
    moveLog.prepend(div);
    while (moveLog.children.length > 40) moveLog.removeChild(moveLog.lastChild);
  }

  function formatSequence(when) {
    const list = Array.isArray(when) ? when : [when];
    return list
      .map((token) => (typeof token === 'string' ? token : moveToString(token)))
      .join(' ');
  }

  function formatOutput(output) {
    if (typeof output === 'string') return output;
    return output?.text ?? '';
  }

  function renderRules() {
    rulesList.innerHTML = '';
    const rules = cubeKeyboard.listRules();
    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '暂无扭转规则';
      rulesList.appendChild(empty);
      return;
    }

    for (const rule of rules) {
      const row = document.createElement('div');
      row.className = 'rule-item';

      const info = document.createElement('div');
      info.className = 'rule-info';
      info.innerHTML = `<span class="rule-seq">${formatSequence(rule.when)}</span><span>→</span><span class="rule-out">${formatOutput(rule.output)}</span>`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'small-button';
      remove.textContent = '删除';
      remove.addEventListener('click', () => {
        cubeKeyboard.removeRule(rule.id);
        renderRules();
        logMove(`已删除规则 ${rule.id}`);
      });

      row.append(info, remove);
      rulesList.appendChild(row);
    }
  }

  function addRule() {
    const sequenceText = ruleSequenceInput.value.trim();
    const outputText = ruleOutputInput.value;
    if (!sequenceText || outputText === '') {
      window.alert('请填写扭转序列和输出字符');
      return;
    }

    const when = sequenceText.split(/\s+/);

    try {
      cubeKeyboard.registerRule({
        id: `rule-${Date.now()}`,
        type: 'turn-sequence',
        when,
        output: outputText,
      });
      ruleSequenceInput.value = '';
      ruleOutputInput.value = '';
      renderRules();
      logMove(`已添加规则：${sequenceText} → ${outputText}`);
    } catch (error) {
      window.alert(`添加规则失败：${error.message}`);
    }
  }

  function getStickerCells(face) {
    const map = cubeKeyboard.listStickerMaps().find((item) => item.face === face);
    return map?.cells || {};
  }

  function renderStickerGrid() {
    const face = stickerFaceSelect.value;
    const cells = getStickerCells(face);
    stickerGrid.innerHTML = '';

    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const key = `${row},${col}`;
        const output = cells[key];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sticker-cell';
        button.dataset.row = row;
        button.dataset.col = col;
        button.textContent = typeof output === 'string' ? output : output?.text ?? '';

        if (selectedStickerCell && selectedStickerCell.row === row && selectedStickerCell.col === col) {
          button.classList.add('selected');
        }

        button.addEventListener('click', () => {
          selectedStickerCell = { row, col };
          stickerOutputInput.value = typeof output === 'string' ? output : output?.text ?? '';
          renderStickerGrid();
          cubeKeyboard.triggerSticker(face, { row, col });
        });

        stickerGrid.appendChild(button);
      }
    }
  }

  function saveStickerCell() {
    if (!selectedStickerCell) {
      window.alert('请先点击一个格子');
      return;
    }
    const text = stickerOutputInput.value;
    if (text === '') {
      cubeKeyboard.clearStickerCell(stickerFaceSelect.value, selectedStickerCell.row, selectedStickerCell.col);
      logMove('已清空该格映射');
    } else {
      cubeKeyboard.setStickerCell(stickerFaceSelect.value, selectedStickerCell.row, selectedStickerCell.col, text);
      logMove(`已保存该格映射：${text}`);
    }
    renderStickerGrid();
  }

  function clearStickerCell() {
    if (!selectedStickerCell) {
      window.alert('请先点击一个格子');
      return;
    }
    cubeKeyboard.clearStickerCell(stickerFaceSelect.value, selectedStickerCell.row, selectedStickerCell.col);
    stickerOutputInput.value = '';
    logMove('已清空该格映射');
    renderStickerGrid();
  }

  function setInputMode(mode) {
    inputMode = mode;
    const isSticker = mode === 'sticker';
    panelRules.hidden = isSticker;
    panelSticker.hidden = !isSticker;
    modeSequencesButton.classList.toggle('active', !isSticker);
    modeStickerButton.classList.toggle('active', isSticker);
    modeHint.textContent = isSticker
      ? '当前：九宫格模式（点击 3×3 贴纸直接输出）'
      : '当前：通过扭转序列输出字符';
  }

  function applyStickerPreset() {
    const face = stickerFaceSelect.value;
    const preset = stickerPresetSelect.value;
    const layouts = {
      qwe: ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'],
      abc: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
      num: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    };
    const chars = layouts[preset] || layouts.qwe;

    let index = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        cubeKeyboard.setStickerCell(face, row, col, chars[index]);
        index += 1;
      }
    }

    selectedStickerCell = null;
    stickerOutputInput.value = '';
    renderStickerGrid();
    logMove(`已应用九宫格预设：${preset}（${FACE_NAMES_ZH[face] || face}）`);
  }

  function clearStickerFace() {
    const face = stickerFaceSelect.value;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        cubeKeyboard.clearStickerCell(face, row, col);
      }
    }
    selectedStickerCell = null;
    stickerOutputInput.value = '';
    renderStickerGrid();
    logMove(`已清空该面九宫格映射（${FACE_NAMES_ZH[face] || face}）`);
  }

  // 参考系变更：同时更新配置与魔方配色
  function onReferenceChange() {
    cubeKeyboard.setReference({
      front: frontSelect.value,
      up: upSelect.value,
    });
    refreshReference();
    logMove('已更新参考系（魔方已复原）');
  }

  frontSelect.addEventListener('change', onReferenceChange);
  upSelect.addEventListener('change', onReferenceChange);
  refManualButton.addEventListener('click', () => setReferenceMode('manual'));
  refSimulateButton.addEventListener('click', () => setReferenceMode('simulate'));
  resetViewButton.addEventListener('click', () => {
    cubeKeyboard.resetView();
    refreshReference();
    logMove('方向模拟视角已重置');
  });
  sidebarToggleButton.addEventListener('click', () => {
    setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
  });
  cubeKeyboard.on('referencechange', () => {
    refreshReference();
    renderKeymap();
  });

  resetButton.addEventListener('click', () => {
    cubeKeyboard.resetCube();
    logMove('魔方已重置');
  });

  resetConfigButton.addEventListener('click', () => {
    cubeKeyboard.resetConfig();
    setReferenceMode('manual');
    refreshReference();
    renderKeymap();
    renderRules();
    renderStickerGrid();
    turnDurationInput.value = String(cubeKeyboard.config.turnDurationMs ?? 180);
    turnDurationLabel.textContent = `${turnDurationInput.value}ms`;
    logMove('已恢复默认配置');
  });

  if (turnDurationInput) {
    turnDurationInput.value = String(cubeKeyboard.config.turnDurationMs ?? 180);
    turnDurationLabel.textContent = `${turnDurationInput.value}ms`;
    turnDurationInput.addEventListener('input', () => {
      const value = Number(turnDurationInput.value);
      cubeKeyboard.setTurnDuration(value);
      turnDurationLabel.textContent = `${value}ms`;
    });
  }

  exportButton.addEventListener('click', () => {
    downloadConfig(cubeKeyboard.exportConfig());
  });

  axesButton.addEventListener('click', () => {
    axesVisible = !axesVisible;
    cubeKeyboard.renderer?.setAxesVisible?.(axesVisible);
    axesButton.textContent = axesVisible ? '隐藏参考线' : '显示参考线';
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      cubeKeyboard.loadConfig(text);
      refreshReference();
      renderKeymap();
      renderRules();
      renderStickerGrid();
      logMove('配置已导入');
    } catch (error) {
      window.alert(`导入失败：${error.message}`);
    } finally {
      importInput.value = '';
    }
  });

  imeModeButton.addEventListener('click', () => ime.toggleMode());
  imeClearButton.addEventListener('click', () => {
    ime.clearOutput();
    logMove('虚拟输入法已清空');
  });

  ruleAddButton.addEventListener('click', addRule);
  modeSequencesButton.addEventListener('click', () => setInputMode('sequences'));
  modeStickerButton.addEventListener('click', () => setInputMode('sticker'));
  stickerFaceSelect.addEventListener('change', () => {
    selectedStickerCell = null;
    stickerOutputInput.value = '';
    renderStickerGrid();
  });
  stickerSaveButton.addEventListener('click', saveStickerCell);
  stickerClearButton.addEventListener('click', clearStickerCell);
  stickerApplyPresetButton.addEventListener('click', applyStickerPreset);
  stickerClearFaceButton.addEventListener('click', clearStickerFace);

  // 键盘控制魔方：E/A/S/D/F/C 分别对应顶/左/正/右/背/底
  window.addEventListener('keydown', async (event) => {
    // 避开浏览器快捷键：Ctrl/Alt/Meta 组合键不处理
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    // 输入框中正常打字，不触发魔方扭转
    if (event.target.matches('input, textarea, select')) return;

    const key = event.key.toLowerCase();
    const mapping = cubeKeyboard.config.keymap?.[key];
    if (!mapping) return;

    event.preventDefault();
    const dir = event.shiftKey ? -1 : 1;
    const done = await cubeKeyboard.turnRelative(mapping.face, dir);
    if (done) {
      const direction = dir === -1 ? '逆时针' : '顺时针';
      const resolved = cubeKeyboard.resolveRelativeTurn?.(mapping.face, dir) || { face: mapping.face };
      logMove(`${FACE_NAMES_ZH[mapping.face] || mapping.face} → ${FACE_NAMES_ZH[resolved.face] || resolved.face} ${direction}（${key.toUpperCase()}）`);
    }
  });

  // 初始渲染
  setInputMode('sequences');
  setReferenceMode(cubeKeyboard.pose.mode || 'manual');
  refreshReference();
  renderKeymap();
  renderRules();
  renderStickerGrid();
  logMove('魔方键盘已就绪');
}
