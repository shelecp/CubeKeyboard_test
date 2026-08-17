// 极简事件发射器：用于解耦模块，例如“字符输出”事件。
export class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(type, callback) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(callback);
  }

  off(type, callback) {
    this._listeners.get(type)?.delete(callback);
  }

  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const callback of set) {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[CubeKeyboard] 事件 ${type} 的回调执行出错：`, error);
      }
    }
  }
}
