const countrySelect = document.getElementById('country');
const refreshBtn = document.getElementById('refresh');
const statusEl = document.getElementById('status');
const flightsEl = document.getElementById('flights');

let allFlights = [];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function titleCase(str) {
  return str.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

function renderFlights() {
  const country = countrySelect.value;
  const filtered = country === 'ALL'
    ? allFlights
    : allFlights.filter((f) => f.from.countryName === country);

  if (filtered.length === 0) {
    const label = country === 'ALL' ? 'any country' : titleCase(country);
    flightsEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">&#9992;</div>
        <div>No flights departing from ${label} this week.</div>
      </div>`;
    return;
  }

  const byDate = {};
  for (const f of filtered) {
    (byDate[f.departureDate] ??= []).push(f);
  }

  let html = '';
  for (const [date, flights] of Object.entries(byDate).sort()) {
    html += `<div class="date-group">`;
    html += `<div class="date-header">${formatDate(date)}</div>`;

    for (const f of flights.sort((a, b) => a.departureTime.localeCompare(b.departureTime))) {
      html += `
        <div class="flight-card">
          <div class="flight-route">
            <span class="airport-code">${f.from.code}</span>
            <span class="route-arrow">&rarr;</span>
            <span class="airport-code">${f.to.code}</span>
          </div>
          <div class="flight-cities">
            ${titleCase(f.from.name)} &rarr; ${titleCase(f.to.name)}
          </div>
          <div class="flight-meta">
            <div class="meta-item">
              <span class="meta-label">Time</span>
              <span class="meta-value time">${f.departureTime} &ndash; ${f.arrivalTime}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Duration</span>
              <span class="meta-value">${f.duration}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Price</span>
              <span class="meta-value price">${f.price.total.value} ${f.price.total.currency}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Seats</span>
              <span class="meta-value seats">${f.bookableSeats}</span>
            </div>
          </div>
          <div class="flight-footer">
            <span>${f.flightNumber}</span>
            <span class="dot"></span>
            <span>${f.ticketingAirline.name}</span>
            <span class="dot"></span>
            <span>${f.aircraft}</span>
          </div>
        </div>`;
    }

    html += `</div>`;
  }

  flightsEl.innerHTML = html;
}

function populateCountries(countries) {
  const current = countrySelect.value;
  countrySelect.innerHTML = '<option value="ALL">All Countries</option>';
  for (const c of countries) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = titleCase(c);
    countrySelect.appendChild(opt);
  }
  if ([...countrySelect.options].some((o) => o.value === current)) {
    countrySelect.value = current;
  } else {
    countrySelect.value = 'UNITED STATES';
  }
}

function setLoading(loading) {
  document.body.classList.toggle('loading', loading);
  refreshBtn.disabled = loading;
  if (loading) {
    statusEl.innerHTML = '<span class="spinner"></span>Loading...';
  }
}

async function fetchFlights() {
  setLoading(true);
  try {
    const res = await fetch('flights.json?' + Date.now());
    if (!res.ok) throw new Error('No data');
    const data = await res.json();

    allFlights = data.flights;
    populateCountries(data.countries);
    renderFlights();
    statusEl.textContent = `${allFlights.length} flights \u00b7 Updated ${timeAgo(data.fetchedAt)}`;
  } catch {
    flightsEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">&#128337;</div>
        <div>No flight data yet.<br>Data refreshes daily.</div>
      </div>`;
    statusEl.textContent = '';
  } finally {
    setLoading(false);
  }
}

countrySelect.addEventListener('change', renderFlights);
refreshBtn.addEventListener('click', () => fetchFlights());

fetchFlights();
