import { getCandidates } from './candidates.js';
import { createT9Engine, KEY_LETTERS } from './t9Engine.js';

// 输入法组词引擎：把"规则引擎/格子点击吐出的一个字符"组装成候选词。
// 每个 profile（src/configs/ime/*.json）声明自己的 engine 类型，
// 这里按类型创建对应引擎；九宫格实验模块在 src/t9/（与输入法体系无关）。

// 功能字符：规则表用它们表示退格/空格/上屏
export const SPECIAL = {
  BACKSPACE: '⌫',
  SPACE: '␣',
  COMMIT: '⇥',
};

function isLetter(ch) {
  return /^[a-zA-Z]$/.test(ch);
}

// 26键拼音：字母累积为拼音串，候选点选上屏
function createPinyinEngine(imeBar) {
  let buffer = '';

  const refresh = () => {
    imeBar.setComposition(buffer);
    if (buffer) {
      const list = getCandidates(buffer);
      imeBar.showCandidates(list);
    } else {
      imeBar.clearCandidates();
    }
  };

  return {
    receive(ch) {
      if (ch === SPECIAL.BACKSPACE) return this.backspace();
      if (ch === SPECIAL.SPACE) {
        const first = imeBar.candidates[0];
        if (first) {
          imeBar.commit(first);
        } else {
          imeBar.commit(' ');
        }
        buffer = '';
        imeBar.reset();
        return;
      }
      if (ch === SPECIAL.COMMIT) {
        if (buffer) imeBar.commit(buffer);
        buffer = '';
        imeBar.reset();
        return;
      }
      if (isLetter(ch)) {
        buffer += ch.toLowerCase();
        refresh();
        return;
      }
      imeBar.commit(ch);
      buffer = '';
      imeBar.reset();
    },
    choose(text) {
      imeBar.commit(text);
      buffer = '';
      imeBar.reset();
    },
    backspace() {
      if (buffer) {
        buffer = buffer.slice(0, -1);
        refresh();
      } else {
        imeBar.backspaceOutput();
      }
    },
    reset() {
      buffer = '';
      imeBar.reset();
    },
    bufferText() {
      return buffer;
    },
  };
}

// 双拼（默认小鹤方案，映射表来自 profile 的 config）：
// 两键 = 声母 + 韵母，解码出音节后显示候选；简版一次处理一个音节。
function createShuangpinEngine(imeBar, config = {}) {
  const initials = config.initials || {};
  const finals = config.finals || {};
  const zeroInitial = config.zeroInitial || {};
  let keys = '';
  let syllable = '';

  const refresh = () => {
    imeBar.setComposition(keys ? `${keys} → ${syllable || '?'}` : '');
    imeBar.showCandidates(syllable ? getCandidates(syllable) : []);
  };

  const decode = () => {
    if (keys.length < 2) {
      syllable = '';
      return;
    }
    const two = keys.slice(0, 2);
    if (zeroInitial[two]) {
      syllable = zeroInitial[two];
      return;
    }
    const initial = initials[two[0]] ?? two[0];
    const final = finals[two[1]];
    syllable = final ? `${initial}${final}` : '';
  };

  return {
    receive(ch) {
      if (ch === SPECIAL.BACKSPACE) return this.backspace();
      if (ch === SPECIAL.SPACE) {
        const first = imeBar.candidates[0];
        if (first) imeBar.commit(first);
        keys = '';
        syllable = '';
        imeBar.reset();
        return;
      }
      if (ch === SPECIAL.COMMIT) {
        keys = '';
        syllable = '';
        imeBar.reset();
        return;
      }
      if (!isLetter(ch)) {
        imeBar.commit(ch);
        return;
      }
      if (keys.length >= 2) keys = keys.slice(-1); // 已有一个音节待选，新键开启下一音节
      keys += ch.toLowerCase();
      decode();
      refresh();
    },
    choose(text) {
      imeBar.commit(text);
      keys = keys.slice(2); // 保留可能已输入的下一音节首键
      syllable = '';
      if (keys) decode();
      refresh();
    },
    backspace() {
      if (keys) {
        keys = keys.slice(0, -1);
        decode();
        refresh();
      } else {
        imeBar.backspaceOutput();
      }
    },
    reset() {
      keys = '';
      syllable = '';
      imeBar.reset();
    },
    bufferText() {
      return keys;
    },
  };
}

// 五笔：预留引擎。字母只做记录展示，候选与字库留待后续接入。
function createWubiEngine(imeBar) {
  let buffer = '';

  const refresh = () => {
    imeBar.setComposition(buffer ? `${buffer}（五笔字库预留，仅记录输入）` : '');
    imeBar.clearCandidates();
  };

  return {
    receive(ch) {
      if (ch === SPECIAL.BACKSPACE) return this.backspace();
      if (ch === SPECIAL.SPACE || ch === SPECIAL.COMMIT) {
        buffer = '';
        refresh();
        return;
      }
      if (isLetter(ch)) {
        buffer = (buffer + ch.toLowerCase()).slice(0, 4);
        refresh();
        return;
      }
      imeBar.commit(ch);
    },
    choose() {},
    backspace() {
      if (buffer) {
        buffer = buffer.slice(0, -1);
        refresh();
      } else {
        imeBar.backspaceOutput();
      }
    },
    reset() {
      buffer = '';
      imeBar.reset();
    },
    bufferText() {
      return buffer;
    },
  };
}

// 九键拼音：扭转输出的"字母组"（abc/def/...）换算成数字键，走九键拼音引擎。
// 与九宫格实验模块无关——这里没有任何贴纸/旋转定位，只有纯粹的"扭层 → 组 → 拼音候选"。
// t9Dict（音节→高频字）由调用方注入，保持本模块可被 Node 测试直接导入。
function createNinekeyEngine(imeBar, t9Dict) {
  const groupToDigit = new Map();
  for (const [digit, letters] of Object.entries(KEY_LETTERS)) {
    if (letters) groupToDigit.set(letters, String(digit));
  }
  groupToDigit.set('标点', '1');

  const t9 = createT9Engine(t9Dict);

  const update = () => {
    imeBar.setComposition(t9.composition());
    imeBar.showCandidates(t9.candidates());
  };

  return {
    receive(ch) {
      const text = typeof ch === 'string' ? ch.trim() : '';
      if (text === SPECIAL.BACKSPACE) {
        t9.backspace();
        update();
        return;
      }
      if (text === SPECIAL.COMMIT) {
        t9.clear();
        update();
        return;
      }
      if (text === SPECIAL.SPACE) {
        const first = t9.candidates()[0];
        if (first) {
          t9.choose(first);
          imeBar.commit(first);
        }
        update();
        return;
      }
      const digit = groupToDigit.get(text);
      if (digit) t9.press(digit);
      update();
    },
    choose(text) {
      if (t9.choose(text)) imeBar.commit(text);
      update();
    },
    backspace() {
      t9.backspace();
      update();
    },
    reset() {
      t9.clear();
      imeBar.reset();
    },
    bufferText() {
      return t9.bufferText();
    },
  };
}

// 纯英文：字符直接上屏
function createEnglishEngine(imeBar) {
  return {
    receive(ch) {
      if (ch === SPECIAL.BACKSPACE) return this.backspace();
      if (ch === SPECIAL.SPACE) {
        imeBar.commit(' ');
        return;
      }
      if (ch === SPECIAL.COMMIT) return;
      imeBar.commit(ch);
    },
    choose() {},
    backspace() {
      imeBar.backspaceOutput();
    },
    reset() {
      imeBar.reset();
    },
    bufferText() {
      return '';
    },
  };
}

// 按 profile 的 engine 字段创建引擎；未知类型回退为英文直出。
// options.t9Dict：九键拼音的音节字典（src/ime/t9-dict.json），由调用方传入。
export function createImeEngine(profile, imeBar, options = {}) {
  switch (profile.engine) {
    case 'pinyin26':
      return createPinyinEngine(imeBar);
    case 'ninekey':
      return createNinekeyEngine(imeBar, options.t9Dict || {});
    case 'shuangpin':
      return createShuangpinEngine(imeBar, profile.config);
    case 'wubi':
      return createWubiEngine(imeBar);
    case 'english':
    default:
      return createEnglishEngine(imeBar);
  }
}
