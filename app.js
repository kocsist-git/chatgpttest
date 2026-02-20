const DAYS_TO_LOAD = 30;
const AUTO_REFRESH_MS = 60 * 60 * 1000;

const statusEl = document.getElementById('status');
const latestRateEl = document.getElementById('latest-rate');
const lastUpdatedEl = document.getElementById('last-updated');
const refreshBtn = document.getElementById('refresh-btn');
const chartCanvas = document.getElementById('eurHufChart');

let chart;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getDateRange(days) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  return { start: formatDate(start), end: formatDate(end) };
}

async function fetchEurHufRates() {
  const { start, end } = getDateRange(DAYS_TO_LOAD);
  const url = `https://api.frankfurter.app/${start}..${end}?from=EUR&to=HUF`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP hiba: ${response.status}`);
  }

  const data = await response.json();
  const labels = Object.keys(data.rates).sort();
  const values = labels.map((date) => data.rates[date].HUF);

  if (!labels.length) {
    throw new Error('Nem érkezett árfolyam adat.');
  }

  return { labels, values };
}

function renderChart(labels, values) {
  if (chart) {
    chart.destroy();
  }

  chart = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '1 EUR értéke HUF-ban',
          data: values,
          borderColor: '#1d4ed8',
          backgroundColor: 'rgba(29, 78, 216, 0.2)',
          fill: true,
          tension: 0.25,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          title: {
            display: true,
            text: 'HUF',
          },
        },
      },
      plugins: {
        legend: {
          display: true,
        },
      },
    },
  });
}

async function updateRates() {
  statusEl.textContent = 'Frissítés folyamatban…';
  refreshBtn.disabled = true;

  try {
    const { labels, values } = await fetchEurHufRates();
    renderChart(labels, values);

    const latestRate = values[values.length - 1];
    const latestDate = labels[labels.length - 1];

    latestRateEl.textContent = `${latestRate.toFixed(2)} HUF`;
    lastUpdatedEl.textContent = `${latestDate} (${new Date().toLocaleTimeString('hu-HU')})`;
    statusEl.textContent = 'Sikeres frissítés.';
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Hiba történt: ${error.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener('click', updateRates);

updateRates();
setInterval(updateRates, AUTO_REFRESH_MS);
