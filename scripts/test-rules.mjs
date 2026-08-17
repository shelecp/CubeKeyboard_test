// 规则引擎测试：扭转序列立即匹配、最长后缀优先、贴纸映射。
import { RuleEngine } from '../src/mapping/ruleEngine.js';
import { DEFAULT_CONFIG } from '../src/mapping/defaultConfig.js';

const engine = new RuleEngine();
const outputs = [];
engine.events.on('output', (result) => outputs.push(result.output));

engine.registerRule({ id: 'b', type: 'turn-sequence', when: ['B'], output: 'b' });
engine.registerRule({ id: 'rb', type: 'turn-sequence', when: ['R', 'B'], output: 'rb' });
engine.registerRule({ id: 'u', type: 'turn-sequence', when: ['U'], output: 'u' });

// 输入 R B：R 不单独命中，B 输入后应匹配最长后缀 R B，立即输出 rb。
engine.onTurn('R', 1);
engine.onTurn('B', 1);
console.log('R B 立即输出 rb：', outputs.includes('rb'));
console.log('R B 不会输出 b：', !outputs.includes('b'));

// 未命中时保留缓冲；后续 U 应只输出 u。
engine.clearTurns();
outputs.length = 0;
engine.onTurn('U', 1);
console.log('U 立即输出 u：', outputs[0] === 'u');

// 多个连续命中时，应依次输出。
engine.clearTurns();
outputs.length = 0;
engine.onTurn('R', 1);
engine.onTurn('B', 1);
engine.onTurn('U', 1);
console.log('R B U 立即输出 rb、u：', outputs.join(',') === 'rb,u');

// 九宫格贴纸映射
engine.registerStickerMap({ id: 'f9', face: 'F', cells: { '0,0': 'Q' } });
let sticker = engine.triggerSticker('F', { row: 0, col: 0 });
console.log('贴纸 F(0,0) -> Q：', sticker?.output === 'Q');

engine.setStickerCell('F', 1, 2, 'X');
sticker = engine.triggerSticker('F', { row: 1, col: 2 });
console.log('贴纸 F(1,2) -> X：', sticker?.output === 'X');

// 默认配置中的模拟功能规则：M 删除、E 空格、S 补全。
const defaultEngine = new RuleEngine();
const defaultOutputs = [];
defaultEngine.events.on('output', (result) => defaultOutputs.push(result.output));
defaultEngine.load(DEFAULT_CONFIG);
defaultEngine.onTurn('M', 1);
defaultEngine.onTurn('E', 1);
defaultEngine.onTurn('S', 1);
console.log('默认规则 M/E/S 输出 ⌫/␣/⇥：', defaultOutputs.join(',') === '⌫,␣,⇥');

console.log('规则引擎测试通过');
