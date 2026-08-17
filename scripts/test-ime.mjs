// 输入法解释逻辑测试：规则输出与输入法响应解耦。
import { interpretInput } from '../src/ime/ImePanel.js';
import { getCandidates } from '../src/ime/candidates.js';

function assert(condition, label) {
  if (!condition) throw new Error(`${label} 不通过`);
  console.log(`${label}：true`);
}

let result = interpretInput('a', 'en');
assert(result.type === 'commit' && result.text === 'a', '英文模式直接提交 ASCII');

result = interpretInput('a', 'zh');
assert(result.type === 'pinyin' && result.text === 'a', '中文模式 ASCII 视为拼音');

result = interpretInput('你', 'zh');
assert(result.type === 'commit' && result.text === '你', '中文模式中文字符直接提交');

result = interpretInput('123', 'zh');
assert(result.type === 'pinyin' && result.text === '123', '中文模式数字视为拼音');

result = interpretInput({ text: 'a', mode: 'zh' }, 'zh');
assert(result.type === 'pinyin' && result.text === 'a', '兼容旧对象输出');

assert(Array.isArray(getCandidates('a')) && getCandidates('a').length > 0, '拼音候选表可返回候选');

console.log('输入法解释逻辑测试通过');
