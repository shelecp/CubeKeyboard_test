import './ui/styles.css';
import { createCubeKeyboard } from './mapping/api.js';
import { setupUI } from './ui/panels.js';

const container = document.getElementById('cube-container');

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 检测浏览器是否支持 WebGL（供运行自检面板展示）
function detectWebGL() {
  const canvas = document.createElement('canvas');
  const result = { webgl2: false, webgl1: false, renderer: '', vendor: '' };

  function readInfo(gl) {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    result.renderer = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    result.vendor = debug
      ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
  }

  try {
    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      result.webgl2 = true;
      readInfo(gl2);
      return result;
    }
  } catch (error) {
    result.error = error.message;
  }

  try {
    const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl1) {
      result.webgl1 = true;
      readInfo(gl1);
    }
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

function renderWebglStatus() {
  const statusEl = document.getElementById('webgl-status');
  const info = detectWebGL();
  const available = info.webgl2 || info.webgl1;

  statusEl.classList.remove('ok', 'bad');
  statusEl.classList.add(available ? 'ok' : 'bad');

  if (available) {
    statusEl.innerHTML = `WebGL${info.webgl2 ? '2' : '1'} 可用<br>渲染器：${escapeHtml(info.renderer || '未知')}`;
  } else {
    statusEl.innerHTML = `WebGL 不可用<br>${escapeHtml(info.error || '浏览器未启用或不支持 WebGL')}`;
  }
}

renderWebglStatus();

try {
  const cubeKeyboard = createCubeKeyboard({ container });

  // 暴露给全局，方便后续让大模型或开发者在控制台直接调用：
  // CubeKeyboard.applyMove("F")、CubeKeyboard.registerRule(...)、CubeKeyboard.exportConfig() 等。
  window.CubeKeyboard = cubeKeyboard;

  reportRenderer(cubeKeyboard);

  setupUI(cubeKeyboard);

  console.info(
    '[CubeKeyboard] 已就绪。可用接口：window.CubeKeyboard',
    Object.keys(cubeKeyboard).filter((key) => typeof cubeKeyboard[key] === 'function'),
  );
} catch (error) {
  console.error('[CubeKeyboard] 初始化失败：', error);
  const info = detectWebGL();
  container.innerHTML = `<div class="webgl-error">
    <strong>无法初始化 3D 场景</strong>
    <p>${escapeHtml(error.message)}</p>
    <p>WebGL2：${info.webgl2 ? '可用' : '不可用'}，WebGL1：${info.webgl1 ? '可用' : '不可用'}</p>
    <p>请使用支持 WebGL 的浏览器（建议 Chrome / Edge），并确认已启用硬件加速。</p>
  </div>`;
}

// 汇报当前渲染方式，并对 WebGL 画面做像素采样诊断，方便定位“不显示”问题。
function reportRenderer(cubeKeyboard) {
  const statusEl = document.getElementById('webgl-status');
  const renderer = cubeKeyboard.renderer;

  statusEl.classList.remove('bad');
  statusEl.classList.add('ok');
  statusEl.innerHTML = 'WebGL 渲染初始化中…';

  setTimeout(() => {
    try {
      const containerSize = `${renderer.container.clientWidth}×${renderer.container.clientHeight}`;
      const dom = renderer.domElement || renderer.renderer?.domElement;
      if (!dom) throw new Error('未找到 WebGL 画布元素');
      const canvasSize = `${dom.width}×${dom.height}`;
      let colorful = null;
      if (dom.width > 0 && dom.height > 0) {
        const copy = document.createElement('canvas');
        copy.width = dom.width;
        copy.height = dom.height;
        const copyCtx = copy.getContext('2d');
        copyCtx.drawImage(dom, 0, 0);
        colorful = countColorful(copyCtx.getImageData(0, 0, copy.width, copy.height).data, copy.width, copy.height);
      }

      const lines = [
        '已启用 WebGL（Three.js）',
        `容器：${containerSize}`,
        `画布：${canvasSize}`,
      ];
      if (colorful !== null) lines.push(`采样彩色像素：${colorful}`);
      if (renderer.lastError) lines.push(`渲染错误：${renderer.lastError.message}`);
      statusEl.innerHTML = lines.join('<br>');

      if (renderer.lastError) {
        statusEl.classList.remove('ok');
        statusEl.classList.add('bad');
      }
    } catch (error) {
      statusEl.classList.remove('ok');
      statusEl.classList.add('bad');
      statusEl.innerHTML = `渲染诊断失败：${escapeHtml(error.message)}`;
    }
  }, 600);
}

function countColorful(data, width, height) {
  let colorful = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 40));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min > 40 && max > 60) colorful += 1;
    }
  }
  return colorful;
}
