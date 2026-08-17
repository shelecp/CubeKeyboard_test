import { getCandidates } from './candidates.js';

// 页面内虚拟输入法面板。
// 规则/贴纸只负责给出一个字符；这里负责决定如何响应：
// - 英文模式：直接上屏；
// - 中文模式：纯英文字母/数字视为拼音并显示候选，其余字符直接上屏。
export function interpretInput(input, mode) {
  const text = typeof input === 'string' ? input : input?.text ?? '';
  if (!text) return null;

  if (mode === 'en') {
    return { type: 'commit', text };
  }

  if (/^[a-z0-9]+$/i.test(text.trim())) {
    return { type: 'pinyin', text: text.trim() };
  }

  return { type: 'commit', text };
}

export class ImePanel {
  constructor({ outputEl, modeButtonEl, candidateEl }) {
    this.outputEl = outputEl;
    this.modeButtonEl = modeButtonEl;
    this.candidateEl = candidateEl;
    this.mode = 'zh'; // 'zh' | 'en'
    this.pending = null;

    this.renderMode();
    this.candidateEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-candidate]');
      if (button) this.commit(button.dataset.candidate);
    });

    // 候选栏出现时，支持数字键 1-9 快速选择
    document.addEventListener('keydown', (event) => {
      if (!this.pending || this.candidateEl.children.length === 0) return;
      if (event.target.matches('input, textarea, select')) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < this.candidateEl.children.length) {
        event.preventDefault();
        this.commit(this.candidateEl.children[index].dataset.candidate);
      }
    });
  }

  setMode(mode) {
    this.mode = mode === 'en' ? 'en' : 'zh';
    this.renderMode();
  }

  toggleMode() {
    this.setMode(this.mode === 'zh' ? 'en' : 'zh');
  }

  renderMode() {
    this.modeButtonEl.textContent = this.mode === 'zh' ? '中文模式' : '英文模式';
  }

  // 接收来自规则引擎/贴纸的字符
  receive(output) {
    const interpreted = interpretInput(output, this.mode);
    if (!interpreted) return;
    if (interpreted.type === 'pinyin') this.showCandidates(interpreted.text);
    else this.commit(interpreted.text);
  }

  showCandidates(pinyin) {
    const list = getCandidates(pinyin);
    this.pending = pinyin;
    this.candidateEl.innerHTML = '';
    list.forEach((candidate, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'candidate';
      button.dataset.candidate = candidate;
      button.innerHTML = `<span class="candidate-char">${candidate}</span><span class="candidate-index">${index + 1}</span>`;
      this.candidateEl.appendChild(button);
    });
  }

  commit(text) {
    if (text == null) return;
    this.outputEl.value += text;
    this.clearCandidates();
  }

  clearCandidates() {
    this.pending = null;
    this.candidateEl.innerHTML = '';
  }

  clearOutput() {
    this.outputEl.value = '';
    this.clearCandidates();
  }
}
