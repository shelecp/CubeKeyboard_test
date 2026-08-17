import { DEFAULT_CONFIG } from './defaultConfig.js';

const STORAGE_KEY = 'cube-keyboard-config-v2';

// 把旧版本配置迁移到当前键位约定：旧 x 转为 c，旧 w 转为 e，并把上一版 r/v 迁移到 e/c。
function migrateConfig(config) {
  const migrated = { ...config };
  delete migrated.shiftInverse;
  const keymap = { ...config.keymap };

  if (keymap.x) {
    keymap.v = keymap.v || keymap.x;
    delete keymap.x;
  }

  if (keymap.w) {
    keymap.r = keymap.r || keymap.w;
    delete keymap.w;
  }

  if (keymap.r) {
    keymap.e = keymap.e || keymap.r;
    delete keymap.r;
  }

  if (keymap.v) {
    keymap.c = keymap.c || keymap.v;
    delete keymap.v;
  }

  for (const [key, value] of Object.entries(DEFAULT_CONFIG.keymap)) {
    if (!keymap[key]) keymap[key] = { ...value };
  }

  return { ...migrated, keymap };
}

// 从浏览器本地存储读取配置，读不到就返回默认配置的副本
export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw);
    return migrateConfig({ ...structuredClone(DEFAULT_CONFIG), ...parsed });
  } catch (error) {
    console.warn('[CubeKeyboard] 读取本地配置失败，使用默认配置：', error);
    return structuredClone(DEFAULT_CONFIG);
  }
}

// 保存配置到浏览器本地存储
export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config, null, 2));
}

// 下载配置为 JSON 文件
export function downloadConfig(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'cube-keyboard-config.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

// 解析 JSON 字符串或对象，并与默认配置合并
export function parseConfig(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  return migrateConfig({ ...structuredClone(DEFAULT_CONFIG), ...obj });
}
