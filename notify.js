import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import nodemailer from "nodemailer";
import { emailHtml } from "./email-template.js";

// Email via SMTP (defaults to Gmail). For Gmail, SMTP_PASS must be an App Password.
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SITE_URL = "https://guivecchi12.github.io/jet-checker/";
const RULES_PATH = "notifications.json";
// --test <flights.json>: send every current matching flight (not just new ones),
// and send a message even when nothing matches, to verify email works.
const TEST = process.argv[2] === "--test";
const [oldPath, newPath] = TEST
  ? [null, process.argv[3]]
  : process.argv.slice(2);

if ((!TEST && !oldPath) || !newPath) {
  console.error(
    "Usage: node notify.js <old-flights.json> <new-flights.json>\n" +
      "       node notify.js --test <flights.json>",
  );
  process.exit(1);
}

const emailEnabled = Boolean(SMTP_USER && SMTP_PASS && NOTIFY_EMAIL);

if (!emailEnabled) {
  console.log("SMTP_USER/SMTP_PASS/NOTIFY_EMAIL not set, skipping notifications.");
  process.exit(TEST ? 1 : 0);
}

if (!TEST && !existsSync(oldPath)) {
  console.log("No previous flight data, skipping notifications.");
  process.exit(0);
}

// Each rule has a direction ("from" or "to") and either a country name or an airport code.
// Example: [{ "direction": "from", "country": "UNITED STATES" }, { "direction": "to", "airport": "JFK" }]
const rules = existsSync(RULES_PATH)
  ? JSON.parse(readFileSync(RULES_PATH, "utf8"))
  : [];
const valid = rules.filter((r) => {
  const ok = ["from", "to"].includes(r.direction) && (r.country || r.airport);
  if (!ok) console.warn(`Skipping invalid rule: ${JSON.stringify(r)}`);
  return ok;
});

if (valid.length === 0) {
  console.log("No notification rules configured, skipping.");
  process.exit(0);
}

const flightKey = (f) =>
  `${f.flightNumber}|${f.departureDate}|${f.from.code}|${f.to.code}`;

const newFlights = JSON.parse(readFileSync(newPath, "utf8")).flights;
const oldFlights = TEST ? [] : JSON.parse(readFileSync(oldPath, "utf8")).flights;

const known = new Set(oldFlights.map(flightKey));
const added = newFlights.filter((f) => !known.has(flightKey(f)));

const titleCase = (str) =>
  str
    .split(" ")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

function matches(flight, rule) {
  const end = flight[rule.direction];
  return rule.airport
    ? end.code === rule.airport.toUpperCase()
    : end.countryName === rule.country.toUpperCase();
}

function ruleLabel(rule) {
  const place = rule.airport
    ? rule.airport.toUpperCase()
    : titleCase(rule.country);
  return `${rule.direction === "from" ? "from" : "to"} ${place}`;
}

const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

function emailBody(hits) {
  if (hits.length === 0) {
    return `Test message: notifications are working. No flights match right now.\n\nView all flights: ${SITE_URL}`;
  }
  return hits
    .map((f) =>
      [
        `${f.flightNumber} (${f.aircraft}) · ${f.ticketingAirline?.name ?? ""}`,
        `  ${f.from.code} ${f.from.name} → ${f.to.code} ${f.to.name}`,
        `  ${f.departureDate} ${f.departureTime}–${f.arrivalTime} (${f.duration})`,
        `  ${f.price.total.value} ${f.price.total.currency} · ${f.bookableSeats} seats`,
      ].join("\n"),
    )
    .concat(`View all flights: ${SITE_URL}`)
    .join("\n\n");
}

async function sendEmail(title, hits) {
  await mailer.sendMail({
    from: `Jet Checker <${SMTP_USER}>`,
    to: NOTIFY_EMAIL,
    subject: title,
    text: emailBody(hits),
    html: emailHtml({ title, hits, siteUrl: SITE_URL, test: TEST }),
  });
}

let failed = false;

for (const rule of valid) {
  const hits = added.filter((f) => matches(f, rule));
  if (hits.length === 0 && !TEST) {
    console.log(`No new flights ${ruleLabel(rule)}.`);
    continue;
  }

  const title = TEST
    ? `[TEST] ${hits.length} current flight${hits.length === 1 ? "" : "s"} ${ruleLabel(rule)}`
    : `${hits.length} new flight${hits.length === 1 ? "" : "s"} ${ruleLabel(rule)}`;

  try {
    await sendEmail(title, hits);
    console.log(`Sent email: ${title}.`);
  } catch (err) {
    console.error(`email failed: ${err.message}`);
    failed = true;
  }
}

if (failed) process.exit(1);
