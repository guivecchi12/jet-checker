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
  return `${Math.floor(diff / 3600)}h ago`;
}

function renderFlights() {
  const country = countrySelect.value;
  const filtered = country === 'ALL'
    ? allFlights
    : allFlights.filter((f) => f.from.countryName === country);

  if (filtered.length === 0) {
    flightsEl.innerHTML = '<div class="empty">No flights found for this country.</div>';
    return;
  }

  // Group by date
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
            ${f.from.name} &rarr; ${f.to.name}
          </div>
          <div class="flight-details">
            <div class="flight-detail">
              <span class="label">Time</span>
              <span class="value">${f.departureTime}&ndash;${f.arrivalTime}</span>
            </div>
            <div class="flight-detail">
              <span class="label">Duration</span>
              <span class="value">${f.duration}</span>
            </div>
            <div class="flight-detail">
              <span class="label">Price</span>
              <span class="value price">${f.price.total.value} ${f.price.total.currency}</span>
            </div>
            <div class="flight-detail">
              <span class="label">Seats</span>
              <span class="value seats">${f.bookableSeats}</span>
            </div>
            <div class="flight-detail">
              <span class="label">Flight</span>
              <span class="value">${f.flightNumber}</span>
            </div>
            <div class="flight-detail">
              <span class="label">Airline</span>
              <span class="value">${f.ticketingAirline.name}</span>
            </div>
            <div class="flight-detail">
              <span class="label">Aircraft</span>
              <span class="value">${f.aircraft}</span>
            </div>
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
    // Title case
    opt.textContent = c.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
    countrySelect.appendChild(opt);
  }
  // Restore previous selection or default to US
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
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    allFlights = data.flights;
    populateCountries(data.countries);
    renderFlights();
    statusEl.textContent = `${allFlights.length} flights \u00b7 Updated ${timeAgo(data.fetchedAt)}`;
  } catch (err) {
    flightsEl.innerHTML = `<div class="error">No flight data yet. Data refreshes every 30 minutes.</div>`;
    statusEl.textContent = 'Waiting for data';
  } finally {
    setLoading(false);
  }
}

countrySelect.addEventListener('change', renderFlights);
refreshBtn.addEventListener('click', () => fetchFlights());

// Auto-fetch on load
fetchFlights();
