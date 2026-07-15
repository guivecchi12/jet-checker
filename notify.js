import "dotenv/config";
import { readFileSync, existsSync } from "fs";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const RULES_PATH = "notifications.json";
const [oldPath, newPath] = process.argv.slice(2);

if (!oldPath || !newPath) {
  console.error("Usage: node notify.js <old-flights.json> <new-flights.json>");
  process.exit(1);
}

if (!NTFY_TOPIC) {
  console.log("NTFY_TOPIC not set, skipping notifications.");
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

for (const rule of valid) {
  const hits = added.filter((f) => matches(f, rule));
  if (hits.length === 0) {
    console.log(`No new flights ${ruleLabel(rule)}.`);
    continue;
  }

  const lines = hits.map(
    (f) =>
      `${f.from.code} → ${f.to.code} · ${f.departureDate} ${f.departureTime} · ${f.price.total.value} ${f.price.total.currency} · ${f.bookableSeats} seats`,
  );

  const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: `${hits.length} new flight${hits.length === 1 ? "" : "s"} ${ruleLabel(rule)}`,
      Tags: "airplane",
      Click: "https://guivecchi12.github.io/jet-checker/",
    },
    body: lines.join("\n"),
  });

  if (!res.ok) {
    console.error(`ntfy request failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  console.log(`Notified ${hits.length} new flight(s) ${ruleLabel(rule)}.`);
}
