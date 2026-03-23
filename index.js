import 'dotenv/config';
import { chromium } from 'playwright';

const BASE_URL = 'https://www.myidtravel.com';
const COMPANY = process.env.MYIDTRAVEL_COMPANY;
const USERNAME = process.env.MYIDTRAVEL_USERNAME;
const PASSWORD = process.env.MYIDTRAVEL_PASSWORD;
const HEADED = process.env.HEADED === 'true';

if (!USERNAME || !PASSWORD) {
  console.error('Missing credentials. Fill in .env file with:');
  console.error('  MYIDTRAVEL_USERNAME, MYIDTRAVEL_PASSWORD');
  process.exit(1);
}

function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage();

  // Intercept the flights API response
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
    // ── 1. Login ──
    console.log('Logging in...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

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
    console.log('Logged in.\n');

    // ── 2. Click "Fly Private Jet" ──
    console.log('Clicking "Fly Private Jet"...');
    const privateJetBtn = page.locator('button:has-text("Fly Private Jet")').first();
    await privateJetBtn.waitFor({ timeout: 15000 });
    await privateJetBtn.click();

    // ── 3. Wait for flights API response ──
    console.log('Waiting for flight data...\n');
    const flightsData = await Promise.race([
      flightsPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out after 60s')), 60000)),
    ]);

    const allFlights = flightsData.flights;
    console.log(`Got ${allFlights.length} total flights.\n`);

    // ── 4. Filter for US departures ──
    const usFlights = allFlights.filter((f) => f.from.countryName === 'UNITED STATES');

    // ── 5. Print results ──
    console.log('='.repeat(80));
    console.log('  PRIVATE JET FLIGHTS DEPARTING FROM US — NEXT 7 DAYS');
    console.log('='.repeat(80));

    if (usFlights.length === 0) {
      console.log('\n  No flights found departing from US airports.\n');
    } else {
      const byDate = {};
      for (const f of usFlights) {
        (byDate[f.departureDate] ??= []).push(f);
      }

      let total = 0;
      for (const [date, flights] of Object.entries(byDate).sort()) {
        console.log(`\n  ${formatDateNice(date)} (${date})`);
        console.log('  ' + '─'.repeat(72));

        for (const f of flights.sort((a, b) => a.departureTime.localeCompare(b.departureTime))) {
          total++;
          const flight = `${f.flightNumber} (${f.aircraft})`.padEnd(20);
          const route = `${f.from.code} → ${f.to.code}`.padEnd(12);
          const cities = `${f.from.name} → ${f.to.name}`;
          const time = `${f.departureTime}–${f.arrivalTime}`.padEnd(14);
          const price = `${f.price.total.value} ${f.price.total.currency}`.padStart(12);
          const seats = `${f.bookableSeats} seats`.padStart(9);
          const airline = f.ticketingAirline.name;

          console.log(`    ${flight} ${route} ${time} ${price}  ${seats}`);
          console.log(`      ${cities}`);
          console.log(`      ${airline}  |  ${f.duration}  |  ${f.priceInfo.priceRemark || ''}`);
          console.log('');
        }
      }

      console.log('  ' + '─'.repeat(72));
      console.log(`  Total: ${total} flight(s) from US airports.`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: 'error-screenshot.png' });
    console.error('Screenshot saved to error-screenshot.png');
  } finally {
    await browser.close();
  }
}

main();
