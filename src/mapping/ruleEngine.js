import { normalizeFace, normalizeSequence, moveToString } from './notation.js';
import { EventEmitter } from '../utils/emitter.js';

function normalizeOutput(output) {
  if (typeof output === 'string') return output;
  if (output && typeof output.text === 'string') return output.text;
  return '';
}

// 规则引擎：把“扭转组合”转换为字符输出。
// （旧版"九宫格贴纸坐标映射"已由格子唯一编号体系取代，见 api.js 的格子文字接口。）
//
// 扭转序列采用“缓冲 + 最长后缀匹配”：
// - 每次扭转先进入缓冲；
// - 只要当前缓冲后缀命中规则，就立即输出并消费已匹配的扭转；
// - 没有命中时保留缓冲，等待下一次扭转继续匹配。
export class RuleEngine {
  constructor() {
    this.rules = [];
    this.buffer = [];
    this.events = new EventEmitter();
  }

  load(config = {}) {
    this.rules = Array.isArray(config.rules)
      ? config.rules.map((rule) => ({ ...rule, output: normalizeOutput(rule.output) }))
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

  // 工具：把归一化后的序列转为可读字符串
  sequenceToString(sequence) {
    return sequence.map(moveToString).join(' ');
  }
}
