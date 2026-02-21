const AUTO_REFRESH_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_KEY = '1m';

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
const latestEurRateEl = document.getElementById('latest-eur-rate');
const latestUsdRateEl = document.getElementById('latest-usd-rate');
const lastUpdatedEl = document.getElementById('last-updated');
const intervalLinksEl = document.getElementById('interval-links');
const eurChartCanvas = document.getElementById('eurHufChart');
const usdChartCanvas = document.getElementById('usdHufChart');
const btcChartCanvas = document.getElementById('btcUsdChart');
const ethChartCanvas = document.getElementById('ethUsdChart');

let eurChart;
let usdChart;
let btcChart;
let ethChart;
let activeIntervalKey = DEFAULT_INTERVAL_KEY;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function setActiveIntervalUI(intervalKey) {
  const buttons = intervalLinksEl.querySelectorAll('.interval-link');
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.interval === intervalKey);
  });
}

function setControlsDisabled(isDisabled) {
  const buttons = intervalLinksEl.querySelectorAll('.interval-link');
  buttons.forEach((button) => {
    button.disabled = isDisabled;
  });
}

function getDateRange(intervalKey) {
  const interval = INTERVALS[intervalKey] || INTERVALS[DEFAULT_INTERVAL_KEY];
  const endDate = new Date();

  if (interval.start) {
    return { start: interval.start, end: formatDate(endDate), label: interval.label, days: 'max' };
  }

  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - interval.days);

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
    label: interval.label,
    days: interval.days,
  };
}

async function fetchRates(base, intervalKey) {
  const { start, end } = getDateRange(intervalKey);
  const url = `https://api.frankfurter.app/${start}..${end}?from=${base}&to=HUF`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP hiba (${base}): ${response.status}`);
  }

  const data = await response.json();
  const labels = Object.keys(data.rates).sort();
  const values = labels.map((date) => data.rates[date].HUF);

  if (!labels.length) {
    throw new Error(`Nem érkezett ${base}/HUF árfolyam adat.`);
  }

  return { labels, values };
}

async function fetchCryptoUsd(coinId, intervalKey) {
  const { days } = getDateRange(intervalKey);
  const daysParam = days === 'max' ? 'max' : Math.max(1, Math.round(days));
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${daysParam}&interval=daily`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP hiba (${coinId}): ${response.status}`);
  }

  const data = await response.json();
  const prices = data.prices || [];
  const labels = prices.map((row) => new Date(row[0]).toISOString().slice(0, 10));
  const values = prices.map((row) => row[1]);

  if (!labels.length) {
    throw new Error(`Nem érkezett ${coinId}/USD árfolyam adat.`);
  }

  return { labels, values };
}

function createOrUpdateChart(existingChart, canvas, labels, values, datasetLabel, color, yAxisLabel) {
  if (existingChart) {
    existingChart.destroy();
  }

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: datasetLabel,
          data: values,
          borderColor: color,
          backgroundColor: `${color}33`,
          fill: true,
          tension: 0.25,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: {
            display: true,
            text: yAxisLabel,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });
}

async function updateRates() {
  const { label } = getDateRange(activeIntervalKey);

  statusEl.textContent = `Frissítés folyamatban (${label})…`;
  setControlsDisabled(true);

  try {
    const [eurData, usdData, btcData, ethData] = await Promise.all([
      fetchRates('EUR', activeIntervalKey),
      fetchRates('USD', activeIntervalKey),
      fetchCryptoUsd('bitcoin', activeIntervalKey),
      fetchCryptoUsd('ethereum', activeIntervalKey),
    ]);

    eurChart = createOrUpdateChart(
      eurChart,
      eurChartCanvas,
      eurData.labels,
      eurData.values,
      `1 EUR értéke HUF-ban (${label})`,
      '#1d4ed8',
      'HUF'
    );

    usdChart = createOrUpdateChart(
      usdChart,
      usdChartCanvas,
      usdData.labels,
      usdData.values,
      `1 USD értéke HUF-ban (${label})`,
      '#059669',
      'HUF'
    );

    btcChart = createOrUpdateChart(
      btcChart,
      btcChartCanvas,
      btcData.labels,
      btcData.values,
      `Bitcoin / USD (${label})`,
      '#f59e0b',
      'USD'
    );

    ethChart = createOrUpdateChart(
      ethChart,
      ethChartCanvas,
      ethData.labels,
      ethData.values,
      `Ethereum / USD (${label})`,
      '#7c3aed',
      'USD'
    );

    latestEurRateEl.textContent = `${eurData.values[eurData.values.length - 1].toFixed(2)} HUF`;
    latestUsdRateEl.textContent = `${usdData.values[usdData.values.length - 1].toFixed(2)} HUF`;
    lastUpdatedEl.textContent = `${new Date().toLocaleString('hu-HU')}`;
    statusEl.textContent = '';
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Hiba történt: ${error.message}`;
  } finally {
    setControlsDisabled(false);
  }
}

intervalLinksEl.addEventListener('click', (event) => {
  const target = event.target.closest('.interval-link');
  if (!target) {
    return;
  }

  const intervalKey = target.dataset.interval;
  if (!INTERVALS[intervalKey] || intervalKey === activeIntervalKey) {
    return;
  }

  activeIntervalKey = intervalKey;
  setActiveIntervalUI(activeIntervalKey);
  updateRates();
});

function initBullionVaultGoldChart() {
  const widgetContainerId = 'bullionvault-gold-widget';
  const fallbackEl = document.getElementById('gold-widget-fallback');

  if (typeof window.BullionVaultChart !== 'function') {
    if (fallbackEl) {
      fallbackEl.hidden = false;
    }
    return;
  }

  try {
    const options = {
      bullion: 'gold',
      currency: 'HUF',
      timeframe: '1m',
      chartType: 'line',
      miniChartModeAxis: 'oz',
      containerDefinedSize: true,
      miniChartMode: false,
      displayLatestPriceLine: true,
      switchBullion: false,
      switchCurrency: false,
      switchTimeframe: true,
      switchChartType: true,
      exportButton: true,
    };

    new window.BullionVaultChart(options, widgetContainerId);
  } catch (error) {
    console.error(error);
    if (fallbackEl) {
      fallbackEl.hidden = false;
    }
  }
}

activeIntervalKey = DEFAULT_INTERVAL_KEY;
setActiveIntervalUI(activeIntervalKey);
updateRates();
setInterval(updateRates, AUTO_REFRESH_MS);

initBullionVaultGoldChart();
