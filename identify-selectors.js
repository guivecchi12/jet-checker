/**
 * Run this script headed to identify the login page selectors.
 * Usage: npm run identify
 *
 * It will open the browser, navigate to myidtravel.com, and pause
 * so you can inspect elements using Playwright Inspector.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('https://www.myidtravel.com');
await page.waitForLoadState('networkidle');

console.log('\n--- Page loaded. Inspect the login form. ---');
console.log('The browser will stay open. Press Ctrl+C to close.\n');

// Print all form elements found
const formElements = await page.evaluate(() => {
  const elements = [];
  document.querySelectorAll('input, select, button, [role="button"], [role="listbox"], [role="combobox"]').forEach(el => {
    elements.push({
      tag: el.tagName,
      type: el.type || '',
      id: el.id || '',
      name: el.name || '',
      class: el.className || '',
      placeholder: el.placeholder || '',
      text: el.textContent?.trim().substring(0, 50) || '',
      role: el.getAttribute('role') || '',
    });
  });
  return elements;
});

console.log('Found form elements:');
console.table(formElements);

// Keep browser open
await page.pause();
