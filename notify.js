import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import nodemailer from "nodemailer";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
// Email via SMTP (defaults to Gmail). For Gmail, SMTP_PASS must be an App Password.
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SITE_URL = "https://guivecchi12.github.io/jet-checker/";
const RULES_PATH = "notifications.json";
const [oldPath, newPath] = process.argv.slice(2);

if (!oldPath || !newPath) {
  console.error("Usage: node notify.js <old-flights.json> <new-flights.json>");
  process.exit(1);
}

const emailEnabled = Boolean(SMTP_USER && SMTP_PASS && NOTIFY_EMAIL);

if (!NTFY_TOPIC && !emailEnabled) {
  console.log(
    "Neither NTFY_TOPIC nor SMTP_USER/SMTP_PASS/NOTIFY_EMAIL set, skipping notifications.",
  );
  process.exit(0);
}

if (!existsSync(oldPath)) {
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

const oldFlights = JSON.parse(readFileSync(oldPath, "utf8")).flights;
const newFlights = JSON.parse(readFileSync(newPath, "utf8")).flights;

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

const mailer = emailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

async function sendNtfy(title, lines) {
  const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: title,
      Priority: "high",
      Tags: "airplane",
      Click: SITE_URL,
    },
    body: lines.join("\n"),
  });
  if (!res.ok) {
    throw new Error(`ntfy request failed: ${res.status} ${await res.text()}`);
  }
}

function emailBody(hits) {
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
  });
}

let failed = false;

for (const rule of valid) {
  const hits = added.filter((f) => matches(f, rule));
  if (hits.length === 0) {
    console.log(`No new flights ${ruleLabel(rule)}.`);
    continue;
  }

  const title = `${hits.length} new flight${hits.length === 1 ? "" : "s"} ${ruleLabel(rule)}`;
  const lines = hits.map(
    (f) =>
      `${f.from.code} → ${f.to.code} · ${f.departureDate} ${f.departureTime} · ${f.price.total.value} ${f.price.total.currency} · ${f.bookableSeats} seats`,
  );

  // Send each channel independently so one failing doesn't block the other.
  const channels = [];
  if (NTFY_TOPIC) channels.push(["ntfy", () => sendNtfy(title, lines)]);
  if (mailer) channels.push(["email", () => sendEmail(title, hits)]);

  for (const [name, send] of channels) {
    try {
      await send();
      console.log(`Sent ${name}: ${hits.length} new flight(s) ${ruleLabel(rule)}.`);
    } catch (err) {
      console.error(`${name} failed: ${err.message}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
