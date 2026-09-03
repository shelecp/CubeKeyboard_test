// E2E：模拟触摸（悬停焦点/点击输出）、编辑模式（弹窗/拖动/浮动保存）、九宫格模式（右上角按钮）。
import { test, expect } from '@playwright/test';
import { openFresh, enterT9, exitT9, pressAll, compText, candidates, outputText } from './helpers.js';

// 复原态正面 F1（Q 格）在默认视角下的画布坐标（1440×900，侧栏展开）
const F1 = { x: 583, y: 307 };
const F2 = { x: 718, y: 307 };
const BLANK = { x: 1100, y: 830 };

test.describe('模拟触摸', () => {
  test('悬停出现焦点，移出消失，点击输出格子文字', async ({ page }) => {
    await openFresh(page);
    await page.mouse.move(F1.x, F1.y);
    await page.waitForFunction(() => window.CubeKeyboard.renderer.hoveredCellId === 'F1');
    expect(await page.evaluate(() => window.CubeKeyboard.renderer.highlightMesh?.visible)).toBe(true);

    await page.mouse.move(BLANK.x, BLANK.y);
    await page.waitForFunction(() => window.CubeKeyboard.renderer.hoveredCellId === null);
    expect(await page.evaluate(() => window.CubeKeyboard.renderer.highlightMesh?.visible)).toBe(false);

    await page.mouse.click(F1.x, F1.y);
    await expect(compText(page)).toHaveText('q'); // F1 默认文字 Q → 拼音缓冲
  });
});

test.describe('编辑模式', () => {
  test('点击格子弹窗、回车暂存、右上角浮动保存出现', async ({ page }) => {
    await openFresh(page);
    await page.locator('#edit-mode').click();
    await page.mouse.click(F1.x, F1.y);
    await page.waitForTimeout(300);

    const popup = page.locator('.cell-editor');
    await expect(popup).toHaveCount(1);
    await expect(popup.locator('.cell-editor-title')).toHaveText('格子 F1');
    await expect(popup.locator('input')).toHaveValue('Q');

    await popup.locator('input').fill('你好世界再见哈哈');
    await popup.locator('input').press('Enter');
    await expect(page.locator('#cells-save-float')).toBeVisible();
    await expect(page.locator('#cells-unsaved')).toContainText('未保存');
    expect(await page.evaluate(() => window.CubeKeyboard.getCellText('F1'))).toBe('你好世界再见哈哈');

    // 点右上角浮动保存 → 隐藏按钮、清除未保存提示
    await page.locator('#cells-save-float').click();
    await expect(page.locator('#cells-save-float')).toBeHidden();
    await expect(page.locator('#cells-unsaved')).toHaveText('');
  });

  test('多弹窗、点击置顶、拖动、总保存后刷新持久化', async ({ page }) => {
    await openFresh(page);
    await page.locator('#edit-mode').click();
    await page.mouse.click(F1.x, F1.y);
    await expect(page.locator('.cell-editor')).toHaveCount(1);
    await page.mouse.click(F2.x, F2.y);
    await expect(page.locator('.cell-editor')).toHaveCount(2);

    const first = page.locator('.cell-editor').first();
    const head = first.locator('.cell-editor-head');
    const box = await head.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await first.boundingBox();
    expect(Math.abs(after.x - box.x)).toBeGreaterThan(100);

    const second = page.locator('.cell-editor').nth(1);
    const zBefore = await second.evaluate((el) => Number(el.style.zIndex));
    await second.locator('.cell-editor-title').click();
    const zAfter = await second.evaluate((el) => Number(el.style.zIndex));
    expect(zAfter).toBeGreaterThan(zBefore);

    await second.locator('input').fill('W2');
    await second.locator('input').press('Enter');
    await page.locator('#cells-save-float').click();
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => Boolean(window.CubeKeyboard?.model));
    expect(await page.evaluate(() => window.CubeKeyboard.getCellText('F2'))).toBe('W2');
  });

  test('取消不保存', async ({ page }) => {
    await openFresh(page);
    await page.locator('#edit-mode').click();
    await page.mouse.click(F1.x, F1.y);
    await expect(page.locator('.cell-editor')).toHaveCount(1);
    const popup = page.locator('.cell-editor');
    await popup.locator('input').fill('临时');
    await popup.getByRole('button', { name: '取消' }).click();
    await expect(page.locator('.cell-editor')).toHaveCount(0);
    expect(await page.evaluate(() => window.CubeKeyboard.getCellText('F1'))).toBe('Q');
  });
});

test.describe('九宫格模式（独立实验模块，非输入法）', () => {
  test('进入后侧栏锁定不可展开，正面 9 格显示键位', async ({ page }) => {
    await openFresh(page);
    await enterT9(page);
    await expect(page.locator('#ime-bar-status')).toHaveText('九宫格模式');
    // 侧栏收起且把手隐藏（不能再展开）
    await expect(page.locator('.sidebar-rail')).toBeHidden();
    expect(await page.evaluate(() => document.body.classList.contains('t9-mode'))).toBe(true);
    // 引擎挂起：扭转不吐字母
    expect(await page.evaluate(() => window.CubeKeyboard.isEngineSuspended())).toBe(true);
    // 恰好 9 个键位覆盖层可见
    await page.waitForFunction(() =>
      [...window.CubeKeyboard.renderer.textOverlays.values()].filter((o) => o.visible).length === 9,
    );
  });

  test('两次旋转定位输入拼音，退出后恢复侧栏与贴纸', async ({ page }) => {
    await openFresh(page);
    await enterT9(page);
    // 好 = 426：4=E行+L列(k,a) 2=U行+M列(r,j) 6=E行+R列(k,d)
    const tap = (key) => page.keyboard.press(key);
    await tap('k'); await tap('a');
    await tap('r'); await tap('j');
    await tap('k'); await tap('d');
    await expect(compText(page)).toContainText('hao');
    await expect(candidates(page).first()).toContainText('好');
    await page.keyboard.press('1');
    await expect(outputText(page)).toHaveValue('好');

    // 九宫格模式下点击格子不输出（只有旋转输入）
    await page.mouse.click(F1.x, F1.y);
    await page.waitForTimeout(300);
    await expect(outputText(page)).toHaveValue('好'); // 未变化

    await exitT9(page);
    expect(await page.evaluate(() => document.body.classList.contains('t9-mode'))).toBe(false);
    await expect(page.locator('.sidebar-rail')).toBeVisible();
    // 退出后恢复当前输入法的贴纸文字（F1..F9 共 9 个可见）
    await page.waitForFunction(() =>
      [...window.CubeKeyboard.renderer.textOverlays.values()].filter((o) => o.visible).length === 9,
    );
  });

  test('旋转换面后键位跟随新正面（标签重算）', async ({ page }) => {
    await openFresh(page);
    await enterT9(page);
    await page.waitForFunction(() =>
      [...window.CubeKeyboard.renderer.textOverlays.values()].filter((o) => o.visible).length === 9,
    );
    const first = await page.evaluate(() =>
      [...window.CubeKeyboard.renderer.textOverlays.entries()]
        .filter(([, o]) => o.visible).map(([id]) => id).sort(),
    );
    await page.keyboard.press('j'); // 竖中层 M：正面中心块换面
    await page.waitForTimeout(600);
    const second = await page.evaluate(() =>
      [...window.CubeKeyboard.renderer.textOverlays.entries()]
        .filter(([, o]) => o.visible).map(([id]) => id).sort(),
    );
    expect(second).not.toEqual(first);
    expect(second).toHaveLength(9);
  });
});
