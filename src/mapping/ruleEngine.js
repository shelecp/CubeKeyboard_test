import { normalizeFace, normalizeSequence, moveToString } from './notation.js';
import { EventEmitter } from '../utils/emitter.js';

function normalizeOutput(output) {
  if (typeof output === 'string') return output;
  if (output && typeof output.text === 'string') return output.text;
  return '';
}

function normalizeStickerCells(cells = {}) {
  const normalized = {};
  for (const [key, output] of Object.entries(cells)) {
    const text = normalizeOutput(output);
    if (text) normalized[key] = text;
  }
  return normalized;
}

// 规则引擎：把“扭转 / 组合”或“贴纸按下”转换为字符输出。
//
// 扭转序列采用“缓冲 + 最长后缀匹配”：
// - 每次扭转先进入缓冲；
// - 只要当前缓冲后缀命中规则，就立即输出并消费已匹配的扭转；
// - 没有命中时保留缓冲，等待下一次扭转继续匹配。
export class RuleEngine {
  constructor() {
    this.rules = [];
    this.stickerMaps = [];
    this.buffer = [];
    this.events = new EventEmitter();
  }

  load(config = {}) {
    this.rules = Array.isArray(config.rules)
      ? config.rules.map((rule) => ({ ...rule, output: normalizeOutput(rule.output) }))
      : [];
    this.stickerMaps = Array.isArray(config.stickerMaps)
      ? config.stickerMaps.map((map) => ({ ...map, cells: normalizeStickerCells(map.cells) }))
      : [];
    this.clearTurns();
  }

  registerRule(rule) {
    if (!rule?.id) throw new Error('规则必须包含 id');
    if (rule.type && rule.type !== 'turn-sequence') {
      throw new Error('当前仅支持 type = "turn-sequence" 的规则');
    }
    const output = normalizeOutput(rule.output);
    if (!output) throw new Error('规则必须包含输出字符');
    normalizeSequence(rule.when); // 校验序列合法
    this.removeRule(rule.id);
    const stored = { ...rule, type: 'turn-sequence', output };
    this.rules.push(stored);
    return stored;
  }

  removeRule(id) {
    this.rules = this.rules.filter((rule) => rule.id !== id);
  }

  listRules() {
    return this.rules.map((rule) => ({
      ...rule,
      when: Array.isArray(rule.when) ? rule.when : [rule.when],
    }));
  }

  registerStickerMap(map) {
    if (!map?.id) throw new Error('贴纸映射必须包含 id');
    const stored = {
      ...map,
      face: normalizeFace(map.face),
      cells: normalizeStickerCells(map.cells),
    };
    this.removeStickerMap(map.id);
    this.stickerMaps.push(stored);
    return stored;
  }

  removeStickerMap(id) {
    this.stickerMaps = this.stickerMaps.filter((map) => map.id !== id);
  }

  listStickerMaps() {
    return [...this.stickerMaps];
  }

  // 记录一次扭转，并立即检查当前缓冲是否能命中规则。
  onTurn(face, dir) {
    const normalizedFace = normalizeFace(face);
    const normalizedDir = dir === -1 ? -1 : dir === 2 ? 2 : 1;
    this.buffer.push({ face: normalizedFace, dir: normalizedDir, t: Date.now() });
    if (this.buffer.length > 64) this.buffer.shift();

    const results = this._emitMatchingSuffixes();
    this.events.emit('turnschange', this.getBuffer());
    return results;
  }

  getBuffer() {
    return this.buffer.map((turn) => ({ face: turn.face, dir: turn.dir }));
  }

  clearTurns() {
    this.buffer = [];
    this.events.emit('turnschange', []);
  }

  // 在当前缓冲里找“最长后缀”命中的规则
  findLongestSuffix() {
    let best = null;

    for (const rule of this.rules) {
      if (!rule || rule.type !== 'turn-sequence') continue;
      const sequence = normalizeSequence(rule.when);
      if (sequence.length === 0 || sequence.length > this.buffer.length) continue;

      let matched = true;
      for (let i = 0; i < sequence.length; i += 1) {
        const recent = this.buffer[this.buffer.length - sequence.length + i];
        if (!recent || recent.face !== sequence[i].face || recent.dir !== sequence[i].dir) {
          matched = false;
          break;
        }
      }

      if (matched && (!best || sequence.length > best.length)) {
        best = { rule, sequence, length: sequence.length };
      }
    }

    return best;
  }

  // 持续寻找当前缓冲末尾能命中的最长规则，命中则立即输出并消费。
  _emitMatchingSuffixes() {
    const results = [];

    while (true) {
      const best = this.findLongestSuffix();
      if (!best) break;

      this.buffer.splice(this.buffer.length - best.length, best.length);
      const result = { rule: best.rule, output: best.rule.output, sequence: best.sequence };
      results.push(result);
      this.events.emit('output', result);
    }

    return results;
  }

  // 按下某个面的九宫格贴纸，返回该格映射的输出；未映射返回 null。
  triggerSticker(face, cell) {
    const normalizedFace = normalizeFace(face);
    const row = Number(cell?.row);
    const col = Number(cell?.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;

    const map = this.stickerMaps.find((item) => item.face === normalizedFace);
    const output = map?.cells?.[`${row},${col}`];
    return output ? { map, output } : null;
  }

  // 新增或更新某个面的九宫格单元格映射；output 为空则删除该格。
  setStickerCell(face, row, col, output) {
    const normalizedFace = normalizeFace(face);
    const r = Number(row);
    const c = Number(col);
    if (!Number.isInteger(r) || !Number.isInteger(c)) throw new Error('贴纸格坐标必须是整数');

    let map = this.stickerMaps.find((item) => item.face === normalizedFace);
    if (!map) {
      map = { id: `face-${normalizedFace}`, face: normalizedFace, cells: {} };
      this.stickerMaps.push(map);
    }

    map.cells = map.cells || {};
    const key = `${r},${c}`;
    const text = normalizeOutput(output);
    if (text) {
      map.cells[key] = text;
    } else {
      delete map.cells[key];
    }
    return map;
  }

  // 工具：把归一化后的序列转为可读字符串
  sequenceToString(sequence) {
    return sequence.map(moveToString).join(' ');
  }
}
