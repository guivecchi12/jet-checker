import 'dotenv/config';
import express from 'express';
import { chromium } from 'playwright';

const PORT = process.env.PORT || 3000;
const COMPANY = process.env.MYIDTRAVEL_COMPANY;
const USERNAME = process.env.MYIDTRAVEL_USERNAME;
const PASSWORD = process.env.MYIDTRAVEL_PASSWORD;

if (!USERNAME || !PASSWORD || !COMPANY) {
  console.error('Missing credentials in .env');
  process.exit(1);
}

// ─── Cache & mutex ───────────────────────────────────────────────
let cache = null; // { flights, countries, fetchedAt }
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let scrapeInProgress = null;

function isCacheFresh() {
  return cache && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL;
}

// ─── Scrape ──────────────────────────────────────────────────────
async function scrapeFlights() {
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
    await page.goto('https://www.myidtravel.com', { waitUntil: 'networkidle' });

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

    const privateJetBtn = page.locator('button:has-text("Fly Private Jet")').first();
    await privateJetBtn.waitFor({ timeout: 15000 });
    await privateJetBtn.click();

    const flightsData = await Promise.race([
      flightsPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out after 60s')), 60000)),
    ]);

    const flights = flightsData.flights;
    const countries = [...new Set(flights.map((f) => f.from.countryName))].sort();

    return { flights, countries, fetchedAt: new Date().toISOString() };
  } finally {
    await browser.close();
  }
}

// ─── Express ─────────────────────────────────────────────────────
const app = express();
app.use(express.static('public'));

app.get('/api/flights', async (req, res) => {
  const force = req.query.force === 'true';

  if (!force && isCacheFresh()) {
    return res.json(cache);
  }

  // Mutex: don't run multiple scrapes at once
  if (!scrapeInProgress) {
    scrapeInProgress = scrapeFlights()
      .then((data) => {
        cache = data;
        scrapeInProgress = null;
        return data;
      })
      .catch((err) => {
        scrapeInProgress = null;
        throw err;
      });
  }

  try {
    const data = await scrapeInProgress;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
