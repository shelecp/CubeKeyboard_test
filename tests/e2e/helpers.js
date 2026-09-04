// 测试辅助：干净的页面环境与常用操作封装。
// 断言统一用 @playwright/test 的 web-first expect（自动轮询重试），
// 不依赖固定等待 —— 无头 swiftshader 下扭转动画帧率很低。
import { expect } from '@playwright/test';

// 打开页面并清空本地存储，保证每条用例从默认配置开始
export async function openFresh(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#ime-bar-status')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.CubeKeyboard?.model));
}

// 切换输入法并等待切换事件链完成
export async function switchIme(page, profileId) {
  await page.locator('#ime-select').selectOption(profileId);
  await page.waitForTimeout(500);
}

// 进入 / 退出九宫格模式（页面右上角按钮，独立于输入法）
export async function enterT9(page) {
  await page.locator('#t9-mode').click();
  await page.waitForTimeout(700);
}

export async function exitT9(page) {
  await page.locator('#t9-mode').click();
  await page.waitForTimeout(700);
}

// 收起侧栏：让魔方回到视口正中（画布坐标断言依赖此状态）
export async function collapseSidebar(page) {
  await page.evaluate(() => document.body.classList.add('sidebar-collapsed'));
  await page.waitForTimeout(400);
}

// 按键扭层：'a' 或组合 'Shift+a'（也接受 ['Shift','a'] 数组）
export async function press(page, combo, wait = 120) {
  const comboStr = Array.isArray(combo) ? combo.join('+') : combo;
  await page.keyboard.press(comboStr);
  await page.waitForTimeout(wait);
}

export async function pressAll(page, combos, wait = 120) {
  for (const combo of combos) await press(page, combo, wait);
}

export function compText(page) {
  return page.locator('#ime-bar-comp');
}

export function candidates(page) {
  return page.locator('#ime-bar-candidates .candidate-char');
}

export function outputText(page) {
  return page.locator('#ime-output');
}

export { expect };
