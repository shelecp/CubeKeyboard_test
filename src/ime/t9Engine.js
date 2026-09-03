// 九键拼音引擎（纯逻辑，不依赖 DOM / JSON 文件，便于单元测试）。
// 交互模型（本模块的独有约定）：
// - 标准九键布局：1=标点、2abc、3def、4ghi、5jkl、6mno、7pqrs、8tuv、9wxyz；
// - 数字串进入缓冲，按音节切分；候选 = 各切分方式下"最后一个音节"的常用字（按字频合并）；
// - 选字后消费该音节对应的数字，剩余数字继续参与下一次切分。
export const KEY_LETTERS = {
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

export const PUNCTUATION = ['，', '。', '？', '！', '、', '：', '；', '…'];

const MAX_BUFFER = 12;
const MAX_PARSES = 24;
const MAX_CANDIDATES = 60;

// 音节 → 数字键序（如 "zhuang" → "948264"）
export function syllableToDigits(syllable) {
  let code = '';
  for (const ch of syllable) {
    for (const [digit, letters] of Object.entries(KEY_LETTERS)) {
      if (letters.includes(ch)) {
        code += digit;
        break;
      }
    }
  }
  return code;
}

export function createT9Engine(syllables) {
  // 数字串 → 可组成该串的音节列表
  const digitIndex = new Map();
  for (const syllable of Object.keys(syllables)) {
    const code = syllableToDigits(syllable);
    if (!code) continue;
    if (!digitIndex.has(code)) digitIndex.set(code, []);
    digitIndex.get(code).push(syllable);
  }

  let buffer = '';
  let lastCandidates = []; // [{ char, syllable }]

  // DP 切分：返回音节切分方案（最多 MAX_PARSES 种，按音节数升序）
  function parse(digits) {
    const results = [];
    const walk = (rest, acc) => {
      if (results.length >= MAX_PARSES) return;
      if (rest === '') {
        results.push([...acc]);
        return;
      }
      for (const [code, list] of digitIndex) {
        if (!code || code.length > rest.length) continue;
        if (rest.startsWith(code)) {
          for (const syllable of list) {
            acc.push(syllable);
            walk(rest.slice(code.length), acc);
            acc.pop();
            if (results.length >= MAX_PARSES) return;
          }
        }
      }
    };
    walk(digits, []);
    results.sort((a, b) => a.length - b.length);
    return results;
  }

  function refresh() {
    lastCandidates = [];
    if (!buffer) return;

    if (buffer === '1') {
      // 标点键：直接给出常用中文标点
      lastCandidates = PUNCTUATION.map((char) => ({ char, syllable: null }));
      return;
    }

    const parses = parse(buffer);
    // 各切分的"末音节候选字"轮询合并：让每种切分的高频字都排到前面，
    // 避免某个多音节的候选把其他切分完全挤出首页。
    const parseLists = parses.map((parseItem) => {
      const lastSyllable = parseItem[parseItem.length - 1];
      return (syllables[lastSyllable] || []).map((char) => ({ char, syllable: lastSyllable }));
    });
    const pointers = parseLists.map(() => 0);
    const seen = new Set();

    while (lastCandidates.length < MAX_CANDIDATES) {
      let added = false;
      for (let i = 0; i < parseLists.length; i += 1) {
        const list = parseLists[i];
        while (pointers[i] < list.length && seen.has(list[pointers[i]].char)) pointers[i] += 1;
        if (pointers[i] < list.length) {
          const item = list[pointers[i]];
          pointers[i] += 1;
          seen.add(item.char);
          lastCandidates.push(item);
          added = true;
          if (lastCandidates.length >= MAX_CANDIDATES) break;
        }
      }
      if (!added) break;
    }
  }

  return {
    press(digit) {
      if (!/^[1-9]$/.test(digit)) return;
      if (buffer.length >= MAX_BUFFER) return;
      buffer += digit;
      refresh();
    },
    backspace() {
      buffer = buffer.slice(0, -1);
      refresh();
    },
    clear() {
      buffer = '';
      refresh();
    },
    // 选字：消费该字对应音节的数字；标点只消费末位 1
    choose(char) {
      const item = lastCandidates.find((candidate) => candidate.char === char);
      if (!item) return false;
      if (item.syllable) {
        const code = syllableToDigits(item.syllable);
        buffer = buffer.slice(0, buffer.length - code.length);
      } else {
        buffer = buffer.slice(0, -1);
      }
      refresh();
      return true;
    },
    // 组词预览：优先展示音节数最少的切分
    composition() {
      if (!buffer) return '';
      if (buffer === '1') return '标点';
      const parses = parse(buffer);
      if (parses.length === 0) return `${buffer}（无匹配拼音）`;
      const alt = parses.length > 1 ? `（另有 ${parses.length - 1} 种切分）` : '';
      return `${buffer} → ${parses[0].join("'")}${alt}`;
    },
    candidates() {
      return lastCandidates.map((candidate) => candidate.char);
    },
    bufferText() {
      return buffer;
    },
  };
}
