import 'dotenv/config';
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const COMPANY = process.env.MYIDTRAVEL_COMPANY;
const USERNAME = process.env.MYIDTRAVEL_USERNAME;
const PASSWORD = process.env.MYIDTRAVEL_PASSWORD;

if (!COMPANY || !USERNAME || !PASSWORD) {
  console.error('Missing credentials');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const flightsPromise = new Promise((resolve) => {
    page.on('response', async (response) => {
      if (response.url().includes('/private-jet/flights') && response.status() === 200) {
        try {
          const json = await response.json();
          if (json.success && json.flights?.length > 0) {
            resolve(json);
          }
        } catch { /* ignore */ }
      }
    });
  });

  try {
    console.log('Navigating to myIDTravel...');
    await page.goto('https://www.myidtravel.com', { waitUntil: 'networkidle' });

    console.log('Logging in...');
    const airlineDropdown = page.locator('#Airline input');
    await airlineDropdown.waitFor({ timeout: 15000 });
    await airlineDropdown.click();
    await airlineDropdown.fill(COMPANY);
    await page.waitForTimeout(500);
    await airlineDropdown.press('Enter');

    await page.locator('#user').fill(USERNAME);
    await page.locator('#password').fill(PASSWORD);
    await page.locator('button[type="submit"], input[type="submit"], button:has-text("Log"), button:has-text("Sign")').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('Clicking Fly Private Jet...');
    const privateJetBtn = page.locator('button:has-text("Fly Private Jet")').first();
    await privateJetBtn.waitFor({ timeout: 15000 });
    await privateJetBtn.click();

    console.log('Waiting for flight data...');
    const flightsData = await Promise.race([
      flightsPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out after 60s')), 60000)),
    ]);

    const flights = flightsData.flights;
    const countries = [...new Set(flights.map((f) => f.from.countryName))].sort();
    const result = { flights, countries, fetchedAt: new Date().toISOString() };

    writeFileSync('public/flights.json', JSON.stringify(result));
    console.log(`Saved ${flights.length} flights from ${countries.length} countries.`);
  } finally {
    await browser.close();
  }
}

main();
