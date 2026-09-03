// 规则引擎测试：扭转序列立即匹配、最长后缀优先、输入法规则表生效。
import { RuleEngine } from '../src/mapping/ruleEngine.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, label) {
  if (!condition) throw new Error(`${label} 不通过`);
  console.log(`${label}：true`);
}

const engine = new RuleEngine();
const outputs = [];
engine.events.on('output', (result) => outputs.push(result.output));

engine.registerRule({ id: 'b', type: 'turn-sequence', when: ['B'], output: 'b' });
engine.registerRule({ id: 'rb', type: 'turn-sequence', when: ['R', 'B'], output: 'rb' });
engine.registerRule({ id: 'u', type: 'turn-sequence', when: ['U'], output: 'u' });

// 输入 R B：R 不单独命中，B 输入后应匹配最长后缀 R B，立即输出 rb。
engine.onTurn('R', 1);
engine.onTurn('B', 1);
assert(outputs.includes('rb'), 'R B 立即输出 rb');
assert(!outputs.includes('b'), 'R B 不会输出 b');

// 未命中时保留缓冲；后续 U 应只输出 u。
engine.clearTurns();
outputs.length = 0;
engine.onTurn('U', 1);
assert(outputs[0] === 'u', 'U 立即输出 u');

// 多个连续命中时，应依次输出。
engine.clearTurns();
outputs.length = 0;
engine.onTurn('R', 1);
engine.onTurn('B', 1);
engine.onTurn('U', 1);
assert(outputs.join(',') === 'rb,u', 'R B U 依次输出 rb、u');

// ---------- 输入法 profile 的规则表（26键拼音） ----------
const profile = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'configs', 'ime', 'pinyin26.json'), 'utf8'),
);
assert(profile.engine === 'pinyin26' && Array.isArray(profile.defaultRules), 'pinyin26 profile 结构完整');

const imeEngine = new RuleEngine();
const imeOutputs = [];
imeEngine.events.on('output', (result) => imeOutputs.push(result.output));
imeEngine.load({ rules: profile.defaultRules });

// 打一个字母：a = U L（先顶面后左面，均顺时针）
imeEngine.onTurn('U', 1);
imeEngine.onTurn('L', 1);
assert(imeOutputs.includes('a'), '规则表：U L 输出字母 a');

// 连续打两个字母不互相误伤：a (U L) + y (D R)
imeEngine.clearTurns();
imeOutputs.length = 0;
for (const [face, dir] of [['U', 1], ['L', 1], ['D', 1], ['R', 1]]) imeEngine.onTurn(face, dir);
assert(imeOutputs.join(',') === 'a,y', '连续两段扭转各自命中、无跨界误匹配');

// 方向参与匹配：U L' 不是 a
imeEngine.clearTurns();
imeOutputs.length = 0;
imeEngine.onTurn('U', 1);
imeEngine.onTurn('L', -1);
assert(imeOutputs.includes('b') && !imeOutputs.includes('a'), "U L' 输出 b（方向敏感）");

// 功能键：S → ␣
imeEngine.clearTurns();
imeOutputs.length = 0;
imeEngine.onTurn('S', 1);
assert(imeOutputs[0] === '␣', 'S 层输出空格');

// 录制语义：扭转 → 记法 token 的往返一致性（录制功能的数据基础）
assert(imeEngine.listRules().every((rule) => Array.isArray(rule.when)), 'listRules 返回数组形式的 when');

console.log('规则引擎测试通过');
