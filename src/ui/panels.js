import { COLOR_NAMES, HEX_COLORS, deriveFaceColors } from '../cube/colors.js';
import { FACE_NAMES_ZH } from '../cube/CubeModel.js';
import { moveToString } from '../mapping/notation.js';
import { ImeBar } from '../ime/ImeBar.js';
import { createImeEngine } from '../ime/engines.js';
import { IME_PROFILES, getProfile } from '../ime/profiles.js';
import t9Dict from '../ime/t9-dict.json';

// 九宫格实验模块的懒加载注册表：glob 方式保证"删除 src/t9/ 目录"后
// 构建 / 运行都不报错（注册表为空时九宫格按钮自动隐藏），其余功能零影响。
const T9_MODULE_LOADERS = import.meta.glob('../t9/T9Module.js');
const T9_MODULE_PATH = '../t9/T9Module.js';

// 组装界面交互：输入法切换、扭转规则（含录制/重置/导入导出）、格子编辑模式、
// 九宫格模式开关、参考系、键盘映射。
export function setupUI(cubeKeyboard) {
  const frontSelect = document.getElementById('front-color');
  const upSelect = document.getElementById('up-color');
  const referenceHint = document.getElementById('reference-hint');
  const refManualButton = document.getElementById('ref-manual');
  const refSimulateButton = document.getElementById('ref-simulate');
  const keysPanel = document.getElementById('keys-panel');
  const moveLog = document.getElementById('move-log');
  const resetCubeButton = document.getElementById('reset-cube');
  const axesButton = document.getElementById('toggle-axes');
  const referenceDetail = document.getElementById('reference-detail');
  const resetViewButton = document.getElementById('reset-view');
  const turnDurationInput = document.getElementById('turn-duration');
  const turnDurationLabel = document.getElementById('turn-duration-label');
  const sidebarToggleButton = document.getElementById('sidebar-toggle');

  // 九宫格模式按钮 + 浮动保存按钮
  const t9Button = document.getElementById('t9-mode');
  const cellsSaveFloat = document.getElementById('cells-save-float');

  // 输入法
  const imeSelect = document.getElementById('ime-select');
  const imeDesc = document.getElementById('ime-desc');

  // 扭转规则
  const rulesList = document.getElementById('rules-list');
  const ruleSequenceInput = document.getElementById('rule-sequence');
  const ruleOutputInput = document.getElementById('rule-output');
  const ruleRecordButton = document.getElementById('rule-record');
  const ruleAddButton = document.getElementById('rule-add');
  const ruleHint = document.getElementById('rule-hint');

  // 动作（规则重置 / 导入导出）
  const resetCurrentRulesButton = document.getElementById('reset-current-ime-rules');
  const resetAllRulesButton = document.getElementById('reset-all-ime-rules');
  const exportRulesButton = document.getElementById('export-ime-rules');
  const importRulesInput = document.getElementById('import-ime-rules');

  // 格子与文字
  const editModeButton = document.getElementById('edit-mode');
  const cellsHint = document.getElementById('cells-hint');
  const cellsUnsaved = document.getElementById('cells-unsaved');

  // 弹窗层（格子编辑浮窗）
  const popupLayer = document.getElementById('popup-layer');

  const imeBar = new ImeBar();

  // ---------- 运行时状态 ----------
  let imeEngine = null;        // 当前输入法引擎
  let currentProfile = getProfile(cubeKeyboard.config.activeIme || 'pinyin26');
  let t9Module = null;         // 九宫格实验模块（独立于输入法）
  let t9Active = false;
  let editMode = false;
  let ruleRecorder = null;     // { tokens: [] } | null
  let editingRuleId = null;    // 正在编辑的规则 id（null = 新增）
  let editingRuleOutput = null;// 锁定输出时保留的原输出
  let axesVisible = true;
  let popupZTop = 500;
  let sidebarCollapsedBeforeT9 = false;
  const openEditors = new Map(); // cellId -> { root, input }

  // 规则引擎当前是否应当暂停（九宫格 / 录制 / 编辑模式都只旋转不吐字）
  function syncEngineSuspension() {
    cubeKeyboard.setEngineSuspended(Boolean(t9Active || ruleRecorder || editMode));
  }

  // ---------- 页面提示 toast ----------
  let toastEl = null;
  let toastTimer = null;
  function showToast(message, kind = '') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.className = `show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = kind; }, 2600);
  }

  function logMove(line) {
    const div = document.createElement('div');
    div.className = 'log-line';
    div.textContent = line;
    moveLog.prepend(div);
    while (moveLog.children.length > 40) moveLog.removeChild(moveLog.lastChild);
  }

  // ---------- 参考系 ----------
  function colorCss(name) {
    const hex = HEX_COLORS[name];
    return hex == null ? '#888888' : `#${hex.toString(16).padStart(6, '0')}`;
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

  function setReferenceMode(mode) {
    const actual = cubeKeyboard.setPoseDetectorMode(mode);
    refManualButton.classList.toggle('active', actual === 'manual');
    refSimulateButton.classList.toggle('active', actual === 'simulate');
    frontSelect.disabled = actual !== 'manual';
    upSelect.disabled = actual !== 'manual';
    resetViewButton.disabled = actual !== 'simulate';
    refreshReference();
  }

  // ---------- 侧栏开合（把手与侧栏同属一体导轨） ----------
  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    sidebarToggleButton.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggleButton.setAttribute('title', collapsed ? '展开侧栏' : '收起侧栏');
    sidebarToggleButton.setAttribute('aria-label', collapsed ? '展开侧栏' : '收起侧栏');
  }

  // ---------- 键位映射展示 ----------
  function renderKeymap() {
    keysPanel.innerHTML = '';
    const derived = deriveFaceColors(cubeKeyboard.pose.getReference());
    const faceColorName = {
      F: derived.front,
      B: derived.back,
      U: derived.up,
      D: derived.down,
      R: derived.right,
      L: derived.left,
    };

    for (const [key, value] of Object.entries(cubeKeyboard.config.keymap || {})) {
      const item = document.createElement('div');
      item.className = 'key-item';

      const keycap = document.createElement('span');
      keycap.className = 'keycap';
      keycap.textContent = key.toUpperCase();

      const resolved = cubeKeyboard.resolveRelativeTurn?.(value.face, 1) || { face: value.face };
      const dot = document.createElement('span');
      dot.className = 'face-dot';
      const colorName = faceColorName[resolved.face];
      if (colorName) dot.style.background = colorCss(colorName);
      dot.title = colorName ?? '';

      const label = document.createElement('span');
      label.textContent = `${FACE_NAMES_ZH[value.face] || value.face} → ${FACE_NAMES_ZH[resolved.face] || resolved.face}`;

      item.append(keycap, dot, label);
      keysPanel.appendChild(item);
    }
  }

  // ---------- 扭转规则（含录制） ----------
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
    const locked = Boolean(currentProfile.lockOutput);
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

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'small-button';
      edit.textContent = '编辑';
      edit.addEventListener('click', () => {
        editingRuleId = rule.id;
        editingRuleOutput = formatOutput(rule.output);
        ruleSequenceInput.value = formatSequence(rule.when);
        ruleOutputInput.value = editingRuleOutput;
        ruleAddButton.textContent = '更新规则';
        logMove(`正在编辑规则 ${rule.id}，可重新录制序列`);
      });

      row.append(info, edit);

      // 锁定输出的输入法（九键）：输出不可改、不能新增、不能删除
      if (!locked) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'small-button';
        remove.textContent = '删除';
        remove.addEventListener('click', () => {
          cubeKeyboard.removeRule(rule.id);
          renderRules();
          logMove(`已删除规则 ${rule.id}`);
        });
        row.append(remove);
      }

      rulesList.appendChild(row);
    }
  }

  function startRecording() {
    ruleRecorder = { tokens: [] };
    syncEngineSuspension();
    ruleRecordButton.textContent = '停止录制';
    ruleRecordButton.classList.add('recording');
    ruleSequenceInput.value = '';
    ruleHint.textContent = '录制中：直接按 R/A/S/D/F/V（+Shift 逆时针）扭层，序列实时填入；再点一次「停止录制」结束。';
  }

  function stopRecording() {
    ruleSequenceInput.value = ruleRecorder.tokens.join(' ');
    ruleRecorder = null;
    syncEngineSuspension();
    ruleRecordButton.textContent = '录制';
    ruleRecordButton.classList.remove('recording');
    ruleHint.textContent = '点「录制」后直接按键扭层，序列会自动填入；也可手动输入，空格分隔多个扭转。';
  }

  function submitRule() {
    const locked = Boolean(currentProfile.lockOutput);
    const sequenceText = ruleSequenceInput.value.trim();
    if (!sequenceText) {
      showToast('请填写扭转序列（可用「录制」直接生成）', 'bad');
      return;
    }

    let outputText = ruleOutputInput.value;
    if (locked) {
      // 九键等锁定输出的输入法：只能改序列，输出沿用正在编辑的规则
      if (!editingRuleId) {
        showToast('该输入法的输出由布局固定，只能编辑已有规则的扭转层', 'bad');
        return;
      }
      outputText = editingRuleOutput;
    } else if (outputText === '') {
      showToast('请填写输出字符', 'bad');
      return;
    }

    const when = sequenceText.split(/\s+/);
    const id = editingRuleId || `rule-${Date.now()}`;

    try {
      cubeKeyboard.registerRule({ id, type: 'turn-sequence', when, output: outputText });
      logMove(`${editingRuleId ? '已更新' : '已添加'}规则：${sequenceText} → ${outputText}`);
      clearRuleForm();
      renderRules();
    } catch (error) {
      showToast(`保存规则失败：${error.message}`, 'bad');
    }
  }

  function clearRuleForm() {
    editingRuleId = null;
    editingRuleOutput = null;
    ruleSequenceInput.value = '';
    ruleOutputInput.value = '';
    ruleAddButton.textContent = '添加规则';
  }

  // 依据当前输入法是否锁定输出，调整规则表单
  function refreshRuleFormForProfile() {
    const locked = Boolean(currentProfile.lockOutput);
    ruleOutputInput.disabled = locked;
    ruleOutputInput.placeholder = locked ? '输出由九键布局固定（abc/def…）' : '输出，如 a';
    // 锁定时仍保留按钮：它用于"更新"已有规则的扭转层（新增会被 submitRule 拦截）
    ruleAddButton.hidden = false;
    if (locked) ruleOutputInput.value = '';
  }

  // ---------- 输入法切换 ----------
  function populateImeSelect() {
    imeSelect.innerHTML = '';
    for (const profile of IME_PROFILES) {
      imeSelect.add(new Option(profile.name, profile.id));
    }
    const stored = cubeKeyboard.config.activeIme;
    imeSelect.value = IME_PROFILES.some((profile) => profile.id === stored) ? stored : 'pinyin26';
  }

  function switchIme(profileId) {
    const profile = getProfile(profileId);
    currentProfile = profile;
    cubeKeyboard.activateProfile(profile.id, profile.defaultRules);
    cubeKeyboard.renderer.setPickEnabled(true);

    cubeKeyboard.applyCellsToRenderer();
    imeEngine = createImeEngine(profile, imeBar, { t9Dict: t9Dict.syllables });
    imeBar.setStatus(profile.name);
    imeBar.onCandidate = (text) => imeEngine?.choose(text);
    imeBar.onBackspace = () => imeEngine?.backspace();
    imeBar.onClear = () => {
      imeEngine?.reset();
      imeBar.clearOutput();
      logMove('输入法已清空');
    };
    imeBar.reset();

    imeDesc.textContent = profile.description;
    refreshRuleFormForProfile();
    clearRuleForm();
    syncEngineSuspension();
    renderRules();
    logMove(`已切换输入法：${profile.name}`);
  }

  // ---------- 格子编辑模式（可拖动浮窗） ----------
  function markUnsaved() {
    cellsSaveFloat.hidden = false;
    cellsUnsaved.textContent = '有未保存的修改，点右上角「保存」写入本地存储';
  }

  function markSaved() {
    cellsSaveFloat.hidden = true;
    cellsUnsaved.textContent = '';
  }

  function bringPopupToFront(root) {
    popupZTop += 1;
    root.style.zIndex = String(popupZTop);
  }

  function saveEditor(cellId, input) {
    cubeKeyboard.setCellText(cellId, input.value);
    markUnsaved();
    logMove(`格子 ${cellId} 已暂存：${input.value || '（空）'}`);
  }

  function closeEditor(cellId) {
    const editor = openEditors.get(cellId);
    if (!editor) return;
    editor.root.remove();
    openEditors.delete(cellId);
  }

  function openCellEditor(cellId) {
    if (openEditors.has(cellId)) {
      const existing = openEditors.get(cellId);
      bringPopupToFront(existing.root);
      existing.input.focus();
      return;
    }

    const root = document.createElement('div');
    root.className = 'cell-editor';

    const head = document.createElement('div');
    head.className = 'cell-editor-head';
    const title = document.createElement('span');
    title.className = 'cell-editor-title';
    title.textContent = `格子 ${cellId}`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = '取消并关闭';
    head.append(title, closeBtn);

    const input = document.createElement('input');
    input.value = cubeKeyboard.getCellText(cellId);
    input.placeholder = '输入该格显示的文字';
    input.spellcheck = false;

    const foot = document.createElement('div');
    foot.className = 'cell-editor-foot';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'primary-button';
    saveBtn.textContent = '保存';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    foot.append(saveBtn, cancelBtn);

    root.append(head, input, foot);
    popupLayer.appendChild(root);

    const offset = openEditors.size * 26;
    const left = Math.min(window.innerWidth - 280, 380 + offset);
    const top = Math.min(window.innerHeight - 190, 120 + offset);
    root.style.left = `${Math.max(8, left)}px`;
    root.style.top = `${Math.max(8, top)}px`;
    bringPopupToFront(root);

    let drag = null;
    head.addEventListener('pointerdown', (event) => {
      if (event.target === closeBtn) return;
      event.preventDefault();
      drag = { pointerId: event.pointerId, offsetX: event.clientX - root.offsetLeft, offsetY: event.clientY - root.offsetTop };
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      root.style.left = `${Math.max(4, event.clientX - drag.offsetX)}px`;
      root.style.top = `${Math.max(4, event.clientY - drag.offsetY)}px`;
    });
    const endDrag = (event) => {
      if (drag && event.pointerId !== drag.pointerId) return;
      drag = null;
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    head.addEventListener('dragstart', (event) => event.preventDefault());

    root.addEventListener('pointerdown', () => bringPopupToFront(root));
    saveBtn.addEventListener('click', () => saveEditor(cellId, input));
    cancelBtn.addEventListener('click', () => closeEditor(cellId));
    closeBtn.addEventListener('click', () => closeEditor(cellId));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveEditor(cellId, input);
      } else if (event.key === 'Escape') {
        closeEditor(cellId);
      }
    });

    openEditors.set(cellId, { root, input });
    input.focus();
  }

  function closeAllEditors() {
    for (const cellId of [...openEditors.keys()]) closeEditor(cellId);
  }

  function enterEditMode() {
    editMode = true;
    editModeButton.textContent = '退出编辑模式';
    editModeButton.classList.remove('primary-button');
    cellsHint.textContent = '编辑模式中：点击魔方格子弹出编辑浮窗（可拖动、回车保存）；魔方仍可旋转，格子编号不会因旋转改变。改完点右上角「保存」。';
    syncEngineSuspension();
    logMove('已进入编辑模式');
  }

  function exitEditMode() {
    if (!editMode) return;
    editMode = false;
    closeAllEditors();
    editModeButton.textContent = '进入编辑模式';
    editModeButton.classList.add('primary-button');
    cellsHint.textContent = '鼠标悬停魔方格子会显示焦点；普通模式点击格子可输出其文字。编辑模式下点击格子即可修改文字，改完点右上角的「保存」按钮持久化。';
    syncEngineSuspension();
    logMove('已退出编辑模式');
  }

  function saveAllCells() {
    cubeKeyboard.saveCells();
    markSaved();
    showToast('已保存全部格子文字', 'ok');
    logMove('已保存：全部格子文字写入本地存储');
  }

  // ---------- 九宫格模式（独立实验模块，非输入法） ----------
  async function setT9Mode(on) {
    if (on) {
      const loader = T9_MODULE_LOADERS[T9_MODULE_PATH];
      if (!loader) {
        showToast('九宫格模块未安装（src/t9/）', 'bad');
        return;
      }
      exitEditMode();
      if (ruleRecorder) stopRecording();
      sidebarCollapsedBeforeT9 = document.body.classList.contains('sidebar-collapsed');
      t9Module = (await loader()).createT9Module({ cubeKeyboard, imeBar, profile: { name: '九宫格模式' } });
      t9Module.activate();
      t9Active = true;
      document.body.classList.add('t9-mode');
      t9Button.classList.add('active');
      t9Button.textContent = '退出九宫格';
      syncEngineSuspension();
      logMove('已进入九宫格模式（侧栏已锁定，点右上角按钮退出）');
      return;
    }

    t9Module?.deactivate();
    t9Module = null;
    t9Active = false;
    document.body.classList.remove('t9-mode');
    t9Button.classList.remove('active');
    t9Button.textContent = '九宫格模式';
    // 恢复当前输入法的贴纸文字与输入法栏回调
    switchIme(cubeKeyboard.config.activeIme || 'pinyin26');
    if (sidebarCollapsedBeforeT9) setSidebarCollapsed(true);
    logMove('已退出九宫格模式');
  }

  // ---------- 模拟触摸：悬停焦点 + 点击输出 ----------
  cubeKeyboard.renderer.onCellClick(({ cellId }) => {
    if (t9Active) return; // 九宫格模式只认旋转输入
    if (editMode) {
      openCellEditor(cellId);
      return;
    }
    const text = cubeKeyboard.triggerCell(cellId);
    if (text) logMove(`触摸格子 ${cellId} → ${text}`);
  });

  // ---------- 规则输出 → 当前输入法 ----------
  cubeKeyboard.on('output', (output) => {
    const text = typeof output === 'string' ? output : output?.text ?? '';
    if (text) imeEngine?.receive(text);
  });

  // 录制：捕获用户视角扭转
  cubeKeyboard.on('turn', ({ face, dir, logical }) => {
    if (!ruleRecorder || !logical) return;
    ruleRecorder.tokens.push(dir === -1 ? `${face}'` : dir === 2 ? `${face}2` : face);
    ruleSequenceInput.value = ruleRecorder.tokens.join(' ');
  });

  cubeKeyboard.on('referencechange', () => {
    refreshReference();
    renderKeymap();
  });

  cubeKeyboard.on('configchange', () => {
    renderKeymap();
    if (!t9Active) cubeKeyboard.applyCellsToRenderer();
  });

  // ---------- 事件绑定 ----------
  for (const color of COLOR_NAMES) {
    frontSelect.add(new Option(color, color));
    upSelect.add(new Option(color, color));
  }

  function onReferenceChange() {
    cubeKeyboard.setReference({ front: frontSelect.value, up: upSelect.value });
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

  t9Button.addEventListener('click', () => setT9Mode(!t9Active));

  resetCubeButton.addEventListener('click', () => {
    cubeKeyboard.resetCube();
    logMove('魔方方向已重置');
  });

  resetCurrentRulesButton.addEventListener('click', () => {
    cubeKeyboard.resetImeRules(currentProfile.id, currentProfile.defaultRules);
    renderRules();
    showToast(`已重置「${currentProfile.name}」的扭转规则`, 'ok');
    logMove(`已重置「${currentProfile.name}」的扭转规则表`);
  });

  resetAllRulesButton.addEventListener('click', () => {
    for (const profile of IME_PROFILES) {
      cubeKeyboard.resetImeRules(profile.id, profile.defaultRules);
    }
    renderRules();
    showToast('已重置所有输入法的扭转规则', 'ok');
    logMove('已重置所有输入法的扭转规则表');
  });

  exportRulesButton.addEventListener('click', () => {
    const payload = cubeKeyboard.exportImeRules();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cube-keyboard-rules-${payload.ime}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    logMove(`已导出「${currentProfile.name}」的扭转规则`);
  });

  importRulesInput.addEventListener('change', async () => {
    const file = importRulesInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const knownImes = IME_PROFILES.map((profile) => profile.id);
      const result = cubeKeyboard.importImeRules(payload, knownImes);
      if (result.ok) {
        renderRules();
        showToast(result.message, 'ok');
        logMove(result.message);
      } else {
        showToast(result.message, 'bad');
        logMove(`导入被拒绝：${result.message}`);
      }
    } catch (error) {
      showToast(`导入失败：${error.message}`, 'bad');
    } finally {
      importRulesInput.value = '';
    }
  });

  function syncRangeProgress() {
    const min = Number(turnDurationInput.min) || 0;
    const max = Number(turnDurationInput.max) || 100;
    const value = Number(turnDurationInput.value);
    turnDurationInput.style.setProperty('--range-progress', String((value - min) / (max - min)));
  }

  turnDurationInput.value = String(cubeKeyboard.config.turnDurationMs ?? 180);
  syncRangeProgress();
  turnDurationInput.addEventListener('input', () => {
    const value = Number(turnDurationInput.value);
    cubeKeyboard.setTurnDuration(value);
    turnDurationLabel.textContent = `${value}ms`;
    syncRangeProgress();
  });

  axesButton.addEventListener('click', () => {
    axesVisible = !axesVisible;
    cubeKeyboard.renderer?.setAxesVisible?.(axesVisible);
    axesButton.textContent = axesVisible ? '隐藏参考线' : '显示参考线';
  });

  imeSelect.addEventListener('change', () => switchIme(imeSelect.value));
  ruleRecordButton.addEventListener('click', () => {
    if (ruleRecorder) stopRecording();
    else startRecording();
  });
  ruleAddButton.addEventListener('click', submitRule);
  editModeButton.addEventListener('click', () => {
    if (editMode) exitEditMode();
    else enterEditMode();
  });
  cellsSaveFloat.addEventListener('click', saveAllCells);

  // 键盘控制魔方：R/A/S/D/F/V 分别对应顶/左/正/右/背/底（键位以 defaultConfig.js 为唯一权威来源）
  window.addEventListener('keydown', async (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
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

  // ---------- 初始渲染 ----------
  populateImeSelect();
  setReferenceMode(cubeKeyboard.pose.mode || 'manual');
  refreshReference();
  renderKeymap();
  markSaved();
  if (!T9_MODULE_LOADERS[T9_MODULE_PATH]) t9Button.hidden = true;
  switchIme(cubeKeyboard.config.activeIme || 'pinyin26');
  logMove('魔方键盘已就绪');
}
