// 悬浮输入法栏：所有输入法（26键拼音 / 九键拼音 / 双拼 / 五笔 / 英文）共用的交互面板。
// 可拖动（按住标题栏）、可像窗口一样拖拽边缘/角落缩放。
// 本类只负责视图与基础交互，"字母如何变成候选"由各输入法引擎（engines.js）决定。
const PAGE_SIZE = 9;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 150;

export class ImeBar {
  constructor() {
    this.root = document.getElementById('ime-bar');
    this.head = document.getElementById('ime-bar-head');
    this.statusEl = document.getElementById('ime-bar-status');
    this.compositionEl = document.getElementById('ime-bar-comp');
    this.prevBtn = document.getElementById('ime-bar-prev');
    this.nextBtn = document.getElementById('ime-bar-next');
    this.candidateEl = document.getElementById('ime-bar-candidates');
    this.backspaceBtn = document.getElementById('ime-bar-backspace');
    this.clearBtn = document.getElementById('ime-bar-clear');
    this.outputEl = document.getElementById('ime-output');

    this.onCandidate = null;   // (text) => void
    this.onBackspace = null;   // () => void
    this.onClear = null;       // () => void

    this.candidates = [];
    this.page = 0;

    this._bindDrag();
    this._bindResize();
    this._bindActions();
    // 初始定位为显式 left/top（脱离 bottom 锚点），此后可任意拖动
    this._placeInitial();
  }

  _placeInitial() {
    const width = Math.min(430, window.innerWidth - 24);
    this.root.style.width = `${width}px`;
    this.root.style.left = `${Math.max(8, window.innerWidth - width - 24)}px`;
    this.root.style.top = `${Math.max(8, Math.round(window.innerHeight * 0.62))}px`;
  }

  _bindActions() {
    this.candidateEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-candidate]');
      if (button) this.onCandidate?.(button.dataset.candidate);
    });

    this.prevBtn.addEventListener('click', () => this.turnPage(-1));
    this.nextBtn.addEventListener('click', () => this.turnPage(1));
    this.backspaceBtn.addEventListener('click', () => this.onBackspace?.());
    this.clearBtn.addEventListener('click', () => {
      this.reset();
      this.onClear?.();
    });

    // 候选可见时数字键 1-9 选择当前页候选；全局退格键转发
    document.addEventListener('keydown', (event) => {
      const typing = event.target.matches?.('input, textarea, select');
      if (this.candidates.length > 0 && !typing) {
        const index = Number(event.key) - 1;
        if (index >= 0 && index < this._pageCandidates().length) {
          event.preventDefault();
          this.onCandidate?.(this._pageCandidates()[index]);
          return;
        }
      }
      if (event.key === 'Backspace' && !typing) {
        this.onBackspace?.();
      }
    });
  }

  // 拖动：按住标题栏移动整条输入法栏；禁止拖动时选中内部文字
  _bindDrag() {
    let drag = null;
    this.head.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      event.preventDefault(); // 防止浏览器把按住拖动识别成文字选择/拖拽
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - this.root.offsetLeft,
        offsetY: event.clientY - this.root.offsetTop,
      };
      this.head.setPointerCapture(event.pointerId);
    });
    this.head.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const x = Math.min(Math.max(event.clientX - drag.offsetX, 4), window.innerWidth - this.root.offsetWidth - 4);
      const y = Math.min(Math.max(event.clientY - drag.offsetY, 4), window.innerHeight - 44);
      this.root.style.left = `${x}px`;
      this.root.style.top = `${y}px`;
    });
    const endDrag = (event) => {
      if (drag && event.pointerId !== drag.pointerId) return;
      drag = null;
    };
    this.head.addEventListener('pointerup', endDrag);
    this.head.addEventListener('pointercancel', endDrag);
    this.head.addEventListener('dragstart', (event) => event.preventDefault());
  }

  // 窗口式缩放：边缘 / 四角拖拽改变大小
  _bindResize() {
    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    for (const dir of dirs) {
      const handle = this.root.querySelector(`[data-resize="${dir}"]`);
      if (!handle) continue;

      let state = null;
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = this.root.getBoundingClientRect();
        state = {
          pointerId: event.pointerId,
          dir,
          startX: event.clientX,
          startY: event.clientY,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        };
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener('pointermove', (event) => {
        if (!state || event.pointerId !== state.pointerId) return;
        const { dir, rect, startX, startY } = state;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        let { left, top, width, height } = rect;
        if (dir.includes('e')) width = Math.max(MIN_WIDTH, rect.width + dx);
        if (dir.includes('s')) height = Math.max(MIN_HEIGHT, rect.height + dy);
        if (dir.includes('w')) {
          width = Math.max(MIN_WIDTH, rect.width - dx);
          left = rect.left + (rect.width - width);
        }
        if (dir.includes('n')) {
          height = Math.max(MIN_HEIGHT, rect.height - dy);
          top = rect.top + (rect.height - height);
        }

        Object.assign(this.root.style, {
          left: `${Math.round(left)}px`,
          top: `${Math.round(top)}px`,
          width: `${Math.round(width)}px`,
          height: `${Math.round(height)}px`,
        });
      });
      const end = (event) => {
        if (state && event.pointerId !== state.pointerId) return;
        state = null;
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }
  }

  setStatus(name) {
    this.statusEl.textContent = name;
  }

  // 组词预览区（拼音 / 数字串 / 提示文字）
  setComposition(text) {
    this.compositionEl.textContent = text || '';
  }

  showCandidates(list) {
    this.candidates = Array.isArray(list) ? list : [];
    this.page = 0;
    this._renderPage();
  }

  clearCandidates() {
    this.candidates = [];
    this.page = 0;
    this._renderPage();
  }

  turnPage(delta) {
    if (this.candidates.length === 0) return;
    const totalPages = Math.max(1, Math.ceil(this.candidates.length / PAGE_SIZE));
    this.page = (this.page + delta + totalPages) % totalPages;
    this._renderPage();
  }

  _pageCandidates() {
    const start = this.page * PAGE_SIZE;
    return this.candidates.slice(start, start + PAGE_SIZE);
  }

  _renderPage() {
    const pageList = this._pageCandidates();
    this.candidateEl.innerHTML = '';
    pageList.forEach((candidate, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'candidate';
      button.dataset.candidate = candidate;
      button.innerHTML = `<span class="candidate-char">${candidate}</span><span class="candidate-index">${index + 1}</span>`;
      this.candidateEl.appendChild(button);
    });
    this.root.classList.toggle('has-candidates', this.candidates.length > 0);
    const totalPages = Math.ceil(this.candidates.length / PAGE_SIZE);
    this.compositionEl.dataset.page = totalPages > 1 ? `${this.page + 1}/${totalPages}页` : '';
  }

  commit(text) {
    if (text == null) return;
    this.outputEl.value += text;
  }

  backspaceOutput() {
    this.outputEl.value = this.outputEl.value.slice(0, -1);
  }

  clearOutput() {
    this.outputEl.value = '';
  }

  reset() {
    this.clearCandidates();
    this.setComposition('');
  }
}
