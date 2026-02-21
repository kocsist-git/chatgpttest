const AUTO_REFRESH_MS = 60 * 60 * 1000;

const INTERVALS = {
  '1d': { label: '1 nap', days: 1 },
  '5d': { label: '5 nap', days: 5 },
  '1m': { label: '1 hónap', days: 30 },
  '6m': { label: '6 hónap', days: 182 },
  '1y': { label: '1 év', days: 365 },
  '5y': { label: '5 év', days: 365 * 5 },
  max: { label: 'Max', start: '1999-01-04' },
};

const statusEl = document.getElementById('status');
const latestRateEl = document.getElementById('latest-rate');
const lastUpdatedEl = document.getElementById('last-updated');
const refreshBtn = document.getElementById('refresh-btn');
const intervalSelectEl = document.getElementById('interval-select');
const chartCanvas = document.getElementById('eurHufChart');

let chart;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getDateRange(intervalKey) {
  const interval = INTERVALS[intervalKey] || INTERVALS['1m'];
  const endDate = new Date();

  if (interval.start) {
    return { start: interval.start, end: formatDate(endDate), label: interval.label };
  }

  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - interval.days);

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
    label: interval.label,
  };
}

async function fetchEurHufRates(intervalKey) {
  const { start, end } = getDateRange(intervalKey);
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

function renderChart(labels, values, intervalLabel) {
  if (chart) {
    chart.destroy();
  }

  chart = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `1 EUR értéke HUF-ban (${intervalLabel})`,
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
  const intervalKey = intervalSelectEl.value;
  const { label } = getDateRange(intervalKey);

  statusEl.textContent = `Frissítés folyamatban (${label})…`;
  refreshBtn.disabled = true;
  intervalSelectEl.disabled = true;

  try {
    const { labels, values } = await fetchEurHufRates(intervalKey);
    renderChart(labels, values, label);

    const latestRate = values[values.length - 1];
    const latestDate = labels[labels.length - 1];

    latestRateEl.textContent = `${latestRate.toFixed(2)} HUF`;
    lastUpdatedEl.textContent = `${latestDate} (${new Date().toLocaleTimeString('hu-HU')})`;
    statusEl.textContent = `Sikeres frissítés (${label}).`;
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Hiba történt: ${error.message}`;
  } finally {
    refreshBtn.disabled = false;
    intervalSelectEl.disabled = false;
  }
}

refreshBtn.addEventListener('click', updateRates);
intervalSelectEl.addEventListener('change', updateRates);

updateRates();
setInterval(updateRates, AUTO_REFRESH_MS);
