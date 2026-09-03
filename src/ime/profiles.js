// 输入法 profile 汇总：每个输入法一个 JSON 文件，存放在 src/configs/ime/。
// 增删输入法 = 增删对应 JSON 文件 + 重跑 gen-ime-profiles.mjs（或手工编辑）。
// 九宫格模式不是输入法，不在此列——它是 src/t9/ 的独立实验模块。
import pinyin26 from '../configs/ime/pinyin26.json';
import ninekey from '../configs/ime/ninekey.json';
import shuangpin from '../configs/ime/shuangpin.json';
import wubi from '../configs/ime/wubi.json';
import english from '../configs/ime/english.json';

export const IME_PROFILES = [pinyin26, ninekey, shuangpin, wubi, english];

export function getProfile(id) {
  return IME_PROFILES.find((profile) => profile.id === id) || IME_PROFILES[0];
}
