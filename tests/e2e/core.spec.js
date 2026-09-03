// E2E：侧栏抽屉把手、键位扭转出字、输入法切换。
import { test, expect } from '@playwright/test';
import { openFresh, switchIme, press, pressAll, compText, candidates, outputText } from './helpers.js';

test.describe('侧栏与全局', () => {
  test('页面加载：3D 渲染、默认输入法与键位', async ({ page }) => {
    await openFresh(page);
    await expect(page.locator('#webgl-status')).toContainText('已启用 WebGL');
    await expect(page.locator('#ime-select')).toHaveValue('pinyin26');
    await expect(page.locator('#ime-bar-status')).toHaveText('26键拼音');
    const keymap = await page.evaluate(() => Object.keys(window.CubeKeyboard.config.keymap).sort());
    expect(keymap).toEqual(['a', 'd', 'f', 'j', 'k', 'l', 'r', 's', 'v']);
    // 规则表来自 profile（26字母 + 3 功能键）
    expect(await page.evaluate(() => window.CubeKeyboard.listRules().length)).toBe(29);
  });

  test('抽屉把手与侧栏一体动画：收起后把手导轨停在屏幕左缘', async ({ page }) => {
    await openFresh(page);
    const toggle = page.locator('#sidebar-toggle');
    // 一体动画判定：面板与导轨都是容器子元素，相对容器的布局位置恒定
    //（只有容器一个 transform 在动，把手导轨不再遮挡面板滚动条）。
    const stateOf = () => page.evaluate(() => {
      const root = document.getElementById('sidebar');
      const containerX = root.getBoundingClientRect().x;
      const panel = document.getElementById('sidebar-panel').getBoundingClientRect();
      const rail = document.querySelector('.sidebar-rail').getBoundingClientRect();
      return {
        containerX: Math.round(containerX * 10) / 10,
        panelOffset: Math.round((panel.x - containerX) * 10) / 10,
        railOffset: Math.round((rail.x - containerX) * 10) / 10,
        railVisible: rail.x < window.innerWidth,
      };
    });

    const before = await stateOf();
    expect(before.containerX).toBe(0);
    expect(before.panelOffset).toBe(0);
    expect(before.railOffset).toBe(330); // 导轨在面板右侧，与侧栏一体

    await toggle.click();
    await page.waitForTimeout(120); // 动画中途：子元素相对容器不动（一体动画）
    const mid = await stateOf();
    expect(mid.containerX).toBeLessThan(-40);
    expect(mid.panelOffset).toBe(0);
    expect(mid.railOffset).toBe(330);

    await page.waitForTimeout(500);
    const after = await stateOf();
    // 容器 -330：面板完全滑出，导轨恰好留在屏幕左缘
    expect(after.containerX).toBeCloseTo(-330, 0);
    expect(after.railVisible).toBe(true);

    await toggle.click();
    await page.waitForTimeout(500);
    const reopened = await stateOf();
    expect(reopened.containerX).toBe(0);
  });
});

test.describe('键位与规则输出', () => {
  test('R/A 两段扭转出字母 a，候选数字键上屏', async ({ page }) => {
    await openFresh(page);
    await pressAll(page, ['r', 'a']);
    await expect(compText(page)).toHaveText('a');
    await expect(candidates(page).first()).toContainText('啊');
    await page.keyboard.press('1');
    await expect(outputText(page)).toHaveValue('啊');
  });

  test('Shift 逆时针：R + Shift+A 出字母 b', async ({ page }) => {
    await openFresh(page);
    await pressAll(page, ['r', ['Shift', 'a']]);
    await expect(compText(page)).toHaveText('b');
  });

  test('S 层功能键：空格与退格', async ({ page }) => {
    await openFresh(page);
    await pressAll(page, ['r', 'a']);
    await expect(candidates(page).first()).toContainText('啊');
    await page.keyboard.press('1'); // 选"啊"上屏
    await expect(outputText(page)).toHaveValue('啊');
    await press(page, 'l'); // S → ␣
    await expect(outputText(page)).toHaveValue('啊 ');
    await press(page, ['Shift', 'l']); // S' → ⌫
    await expect(outputText(page)).toHaveValue('啊');
  });
});

test.describe('输入法切换', () => {
  test('双拼：两键定音节（h+c → hao）', async ({ page }) => {
    await openFresh(page);
    await switchIme(page, 'shuangpin');
    await expect(page.locator('#ime-bar-status')).toHaveText('双拼（小鹤）');
    await pressAll(page, ['r', ['Shift', 's'], 'r', 'j']); // h = U F'，c = U M
    await expect(compText(page)).toContainText('hao');
    await expect(candidates(page).first()).toContainText('好');
  });

  test('九键拼音：扭层输出字母组，组→数字→九键候选；输出锁定但可改扭转层', async ({ page }) => {
    await openFresh(page);
    await switchIme(page, 'ninekey');
    await expect(page.locator('#ime-bar-status')).toHaveText('九键拼音');
    // 锁定输出：输出框禁用
    await expect(page.locator('#rule-output')).toBeDisabled();
    // L→mno(6)，U→ghi(4) → 64 → ni
    await pressAll(page, ['a', 'r']);
    await expect(compText(page)).toContainText('ni');
    await expect(candidates(page).first()).toContainText('你');

    // 编辑一条规则：改扭转层、输出保持不变
    const before = await page.evaluate(() => {
      const r = window.CubeKeyboard.listRules().find((x) => x.output === 'abc');
      return r ? r.when.join(' ') : null;
    });
    await page.locator('.rule-item', { has: page.locator('.rule-out', { hasText: 'abc' }) }).locator('text=编辑').click();
    await page.locator('#rule-sequence').fill("R'");
    await page.locator('#rule-add').click();
    const after = await page.evaluate(() => {
      const r = window.CubeKeyboard.listRules().find((x) => x.output === 'abc');
      return r ? r.when.join(' ') : null;
    });
    expect(before).not.toBe(after);
    expect(after).toBe("R'");
  });

  test('五笔：规则生效但字库预留', async ({ page }) => {
    await openFresh(page);
    await switchIme(page, 'wubi');
    await pressAll(page, ['r', 'a']); // 字母 a
    await expect(compText(page)).toContainText('预留');
  });

  test('英文：字母直接上屏', async ({ page }) => {
    await openFresh(page);
    await switchIme(page, 'english');
    await pressAll(page, ['r', ['Shift', 's'], 'r', 'f']); // h i
    await expect(outputText(page)).toHaveValue('hi');
  });

  test('每个输入法有独立规则表：切换后规则不同步', async ({ page }) => {
    await openFresh(page);
    // 在 pinyin26 下加一条规则
    await page.locator('#rule-sequence').fill('U M2');
    await page.locator('#rule-output').fill('∑');
    await page.locator('#rule-add').click();
    await expect(page.locator('.rule-out').filter({ hasText: '∑' })).toHaveCount(1);

    // 切到英文再切回来，规则仍在；而英文自己的表没有这条
    await switchIme(page, 'english');
    expect(await page.evaluate(() => window.CubeKeyboard.listRules().some((r) => r.output === '∑'))).toBe(false);
    await switchIme(page, 'pinyin26');
    expect(await page.evaluate(() => window.CubeKeyboard.listRules().some((r) => r.output === '∑'))).toBe(true);
  });

  test('规则录制：扭转序列自动填入并可添加', async ({ page }) => {
    await openFresh(page);
    await page.locator('#rule-record').click();
    await expect(page.locator('#rule-hint')).toContainText('录制中');
    await pressAll(page, ['r', 'a']);
    // 等扭转动画播完、turn 事件把序列填进输入框（无头渲染帧率低，不能按固定时间等）
    await expect(page.locator('#rule-sequence')).toHaveValue('U L', { timeout: 10000 });
    await page.locator('#rule-record').click(); // 停止
    await expect(page.locator('#rule-sequence')).toHaveValue('U L');
    await page.locator('#rule-output').fill('@');
    await page.locator('#rule-add').click();
    expect(await page.evaluate(() => window.CubeKeyboard.listRules().some((r) => r.output === '@'))).toBe(true);
  });
});

test.describe('动作面板：规则重置与导入导出', () => {
  test('重置当前输入法扭转规则', async ({ page }) => {
    await openFresh(page);
    await page.locator('#rule-sequence').fill('U M2');
    await page.locator('#rule-output').fill('∑');
    await page.locator('#rule-add').click();
    await expect(page.locator('.rule-out').filter({ hasText: '∑' })).toHaveCount(1);

    await page.locator('#reset-current-ime-rules').click();
    await expect(page.locator('.rule-out').filter({ hasText: '∑' })).toHaveCount(0);
    expect(await page.evaluate(() => window.CubeKeyboard.listRules().length)).toBe(29);
  });

  test('导出当前输入法扭转规则为带标识的文件', async ({ page }) => {
    await openFresh(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export-ime-rules').click(),
    ]);
    expect(download.suggestedFilename()).toContain('pinyin26');
  });

  test('导入不匹配输入法的规则表被页面提示拒绝，匹配后成功', async ({ page }) => {
    await openFresh(page); // 当前 pinyin26
    const payload = {
      type: 'cube-keyboard-ime-rules',
      version: 1,
      ime: 'english',
      rules: [{ id: 'imp-z', type: 'turn-sequence', when: ['U'], output: 'z' }],
    };
    const file = { name: 'rules.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) };

    await page.locator('#import-ime-rules').setInputFiles(file);
    await expect(page.locator('#toast')).toContainText('不匹配');

    await switchIme(page, 'english');
    await page.locator('#import-ime-rules').setInputFiles(file);
    await expect(page.locator('#toast')).toContainText('已导入');
    expect(await page.evaluate(() => window.CubeKeyboard.listRules().some((r) => r.output === 'z'))).toBe(true);
  });
});
