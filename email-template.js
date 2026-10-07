// HTML email for flight alerts. Table layout + inline styles so it renders in Gmail/Apple Mail/Outlook.

const C = {
  navy: "#0f172a",
  sky: "#38bdf8",
  skyDark: "#0369a1",
  bg: "#f1f5f9",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  dim: "#475569",
  muted: "#94a3b8",
  greenBg: "#dcfce7",
  greenText: "#166534",
  amberBg: "#fef3c7",
  amberText: "#92400e",
};
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// "SAN FRANCISCO INTERNATIONAL APT" -> "San Francisco International"
const placeName = (name) =>
  String(name ?? "")
    .replace(/\s+(APT|AIRPORT)$/i, "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const dayDiff = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

function money(amount) {
  if (!amount) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: amount.currency,
    }).format(Number(amount.value));
  } catch {
    return `${amount.value} ${amount.currency}`;
  }
}

function pill(text, bg, fg) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:600;">${esc(text)}</span>`;
}

function flightCard(f) {
  const plusDays = f.arrivalDate ? dayDiff(f.departureDate, f.arrivalDate) : 0;
  const arrival = `${esc(f.arrivalTime)}${plusDays > 0 ? `<sup style="font-size:10px;color:${C.muted};"> +${plusDays}</sup>` : ""}`;
  const fare = f.price?.fare;
  const fees = f.price?.sumOfAllTaxesAndFee;
  const breakdown =
    fare && fees ? `${money(fare)} fare + ${money(fees)} fees` : "";
  const seats = `${f.bookableSeats} seat${f.bookableSeats === 1 ? "" : "s"}`;
  const airline = f.ticketingAirline?.name ?? f.operatingAirline?.name ?? "";

  return `
<tr><td style="padding:0 0 16px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-radius:14px;">
  <tr><td style="padding:18px 20px 0 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:13px;font-weight:700;color:${C.skyDark};text-transform:uppercase;letter-spacing:0.5px;">${esc(fmtDate(f.departureDate))}</td>
      <td align="right">${pill(seats, C.greenBg, C.greenText)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 20px 4px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="38%" valign="top">
        <div style="font-size:30px;font-weight:800;color:${C.text};line-height:1;">${esc(f.from.code)}</div>
        <div style="font-size:16px;font-weight:600;color:${C.text};padding-top:6px;">${esc(f.departureTime)}</div>
      </td>
      <td width="24%" align="center" valign="middle" style="color:${C.muted};font-size:12px;">
        <div style="font-size:18px;color:${C.sky};">&#9992;</div>
        <div style="padding-top:2px;">${esc(f.duration)}</div>
      </td>
      <td width="38%" align="right" valign="top">
        <div style="font-size:30px;font-weight:800;color:${C.text};line-height:1;">${esc(f.to.code)}</div>
        <div style="font-size:16px;font-weight:600;color:${C.text};padding-top:6px;">${arrival}</div>
      </td>
    </tr>
    <tr>
      <td valign="top" style="font-size:12px;color:${C.dim};padding-top:4px;">${esc(placeName(f.from.name))}</td>
      <td></td>
      <td align="right" valign="top" style="font-size:12px;color:${C.dim};padding-top:4px;">${esc(placeName(f.to.name))}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 20px 18px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};"><tr>
      <td valign="bottom" style="padding-top:14px;">
        <div style="font-size:22px;font-weight:800;color:${C.text};">${esc(money(f.price?.total))}</div>
        ${breakdown ? `<div style="font-size:12px;color:${C.muted};padding-top:2px;">${esc(breakdown)}</div>` : ""}
      </td>
      <td align="right" valign="bottom" style="padding-top:14px;font-size:12px;color:${C.dim};line-height:1.5;">
        <div style="font-weight:600;color:${C.text};">${esc(airline)}</div>
        <div>${esc(f.flightNumber)} · ${esc(f.aircraft)}</div>
      </td>
    </tr></table>
  </td></tr>
</table>
</td></tr>`;
}

export function emailHtml({ title, hits, siteUrl, test = false }) {
  const body = hits.length
    ? hits.map(flightCard).join("")
    : `<tr><td style="padding:0 0 16px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-radius:14px;"><tr><td style="padding:24px 20px;font-size:15px;color:${C.dim};text-align:center;">Notifications are working. No flights match right now.</td></tr></table></td></tr>`;

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td style="background:${C.navy};border-radius:14px;padding:20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="44" valign="middle">
        <div style="width:40px;height:40px;border-radius:10px;background:#1e293b;color:${C.sky};font-weight:800;font-size:17px;line-height:40px;text-align:center;">JF</div>
      </td>
      <td valign="middle" style="padding-left:12px;">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Jet Flights${test ? ` &nbsp;${pill("TEST", C.amberBg, C.amberText)}` : ""}</div>
        <div style="font-size:18px;font-weight:700;color:#f1f5f9;padding-top:2px;">${esc(title.replace(/^\[TEST\]\s*/, ""))}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>
  ${body}
  <tr><td align="center" style="padding:4px 0 8px 0;">
    <a href="${esc(siteUrl)}" style="display:inline-block;background:${C.navy};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">View all flights &rarr;</a>
  </td></tr>
  <tr><td align="center" style="padding:16px 0 0 0;font-size:11px;color:${C.muted};line-height:1.5;">
    Prices and seats as of the latest check. Flights are subject to slot and permit availability.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
