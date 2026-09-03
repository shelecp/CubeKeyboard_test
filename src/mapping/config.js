import { DEFAULT_CONFIG } from './defaultConfig.js';

// v3：不再做任何旧配置迁移。历史上 v2 的"键位迁移链"（r/v→e/c 静默改写）
// 曾导致用户键位漂移，已彻底移除。旧版本 localStorage 配置直接作废，
// 键位等默认值永远以 defaultConfig.js 为唯一权威来源。
const STORAGE_KEY = 'cube-keyboard-config-v3';

// 从浏览器本地存储读取配置，读不到就返回默认配置的副本
export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_CONFIG), ...parsed };
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

// 解析 JSON 字符串或对象，并与默认配置合并（不做任何迁移改写）
export function parseConfig(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  return { ...structuredClone(DEFAULT_CONFIG), ...obj };
}
