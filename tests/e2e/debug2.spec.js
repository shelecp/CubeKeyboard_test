// 临时调试（跑完即删）
import { test, expect } from '@playwright/test';
import { openFresh, press, outputText, compText } from './helpers.js';

test('debug space solo', async ({ page }) => {
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await openFresh(page);
  await press(page, 'r');
  await press(page, 'a');
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  console.log('MID ' + JSON.stringify({ out: await outputText(page), comp: await compText(page) }));
  await press(page, 'l');
  await page.waitForTimeout(200);
  const s = await page.evaluate(() => ({
    out: document.getElementById('ime-output').value,
    comp: document.getElementById('ime-bar-comp').textContent,
    buffer: window.CubeKeyboard.engine.getBuffer(),
    candidates: document.querySelectorAll('#ime-bar-candidates .candidate').length,
  }));
  console.log('AFTER-L ' + JSON.stringify(s));
  console.log('LOGS ' + logs.join(' | '));
});
