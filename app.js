const AUTO_REFRESH_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_KEY = '1m';

const INTERVALS = {
  '1d': { label: '1 nap', days: 1 },
  '5d': { label: '5 nap', days: 5 },
  '1m': { label: '1 hónap', days: 30 },
  '6m': { label: '6 hónap', days: 182 },
  '1y': { label: '1 év', days: 365 },
  '5y': { label: '5 év', days: 365 * 5 },
  max: { label: 'Max', start: '2010-01-01' },
};

const CRYPTO_SYMBOLS = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
};

const statusEl = document.getElementById('status');
const latestEurRateEl = document.getElementById('latest-eur-rate');
const latestUsdRateEl = document.getElementById('latest-usd-rate');
const latestBtcRateEl = document.getElementById('latest-btc-rate');
const latestEthRateEl = document.getElementById('latest-eth-rate');
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

async function fetchCryptoUsdFromBinance(coinId, intervalKey) {
  const symbol = CRYPTO_SYMBOLS[coinId];
  const { start, end } = getDateRange(intervalKey);
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T23:59:59Z`).getTime();

  let cursor = startMs;
  const rows = [];

  while (cursor < endMs) {
    const url = new URL('https://api.binance.com/api/v3/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1d');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endMs));
    url.searchParams.set('limit', '1000');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP hiba (${coinId}/Binance): ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || !data.length) {
      break;
    }

    rows.push(...data);
    const lastOpenTime = Number(data[data.length - 1][0]);
    cursor = lastOpenTime + 24 * 60 * 60 * 1000;

    if (data.length < 1000) {
      break;
    }
  }

  const labels = rows.map((row) => new Date(Number(row[0])).toISOString().slice(0, 10));
  const values = rows.map((row) => Number(row[4]));

  if (!labels.length) {
    throw new Error(`Nem érkezett ${coinId}/USD árfolyam adat (Binance).`);
  }

  return { labels, values };
}

async function fetchCryptoUsdFromCryptoCompare(coinId, intervalKey) {
  const ticker = coinId === 'bitcoin' ? 'BTC' : 'ETH';
  const { days } = getDateRange(intervalKey);
  const limit = days === 'max' ? 2000 : Math.max(2, Math.min(2000, Math.round(days) + 1));
  const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${ticker}&tsym=USD&limit=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP hiba (${coinId}/CryptoCompare): ${response.status}`);
  }

  const payload = await response.json();
  const rows = payload?.Data?.Data || [];
  const labels = rows.map((row) => new Date(Number(row.time) * 1000).toISOString().slice(0, 10));
  const values = rows.map((row) => Number(row.close));

  if (!labels.length) {
    throw new Error(`Nem érkezett ${coinId}/USD árfolyam adat (CryptoCompare).`);
  }

  return { labels, values };
}

async function fetchCryptoUsd(coinId, intervalKey) {
  try {
    return await fetchCryptoUsdFromBinance(coinId, intervalKey);
  } catch (binanceError) {
    console.warn(binanceError);
    return fetchCryptoUsdFromCryptoCompare(coinId, intervalKey);
  }
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

  const [eurRes, usdRes, btcRes, ethRes] = await Promise.allSettled([
    fetchRates('EUR', activeIntervalKey),
    fetchRates('USD', activeIntervalKey),
    fetchCryptoUsd('bitcoin', activeIntervalKey),
    fetchCryptoUsd('ethereum', activeIntervalKey),
  ]);

  let fxOk = false;
  let cryptoErrors = 0;

  try {
    if (eurRes.status === 'fulfilled') {
      const eurData = eurRes.value;
      eurChart = createOrUpdateChart(
        eurChart,
        eurChartCanvas,
        eurData.labels,
        eurData.values,
        `1 EUR értéke HUF-ban (${label})`,
        '#1d4ed8',
        'HUF'
      );
      latestEurRateEl.textContent = `${eurData.values[eurData.values.length - 1].toFixed(2)} HUF`;
      fxOk = true;
    }

    if (usdRes.status === 'fulfilled') {
      const usdData = usdRes.value;
      usdChart = createOrUpdateChart(
        usdChart,
        usdChartCanvas,
        usdData.labels,
        usdData.values,
        `1 USD értéke HUF-ban (${label})`,
        '#059669',
        'HUF'
      );
      latestUsdRateEl.textContent = `${usdData.values[usdData.values.length - 1].toFixed(2)} HUF`;
      fxOk = true;
    }

    if (btcRes.status === 'fulfilled') {
      const btcData = btcRes.value;
      btcChart = createOrUpdateChart(
        btcChart,
        btcChartCanvas,
        btcData.labels,
        btcData.values,
        `Bitcoin / USD (${label})`,
        '#f59e0b',
        'USD'
      );
      latestBtcRateEl.textContent = `${btcData.values[btcData.values.length - 1].toLocaleString('hu-HU', { maximumFractionDigits: 2 })} USD`;
    } else {
      cryptoErrors += 1;
    }

    if (ethRes.status === 'fulfilled') {
      const ethData = ethRes.value;
      ethChart = createOrUpdateChart(
        ethChart,
        ethChartCanvas,
        ethData.labels,
        ethData.values,
        `Ethereum / USD (${label})`,
        '#7c3aed',
        'USD'
      );
      latestEthRateEl.textContent = `${ethData.values[ethData.values.length - 1].toLocaleString('hu-HU', { maximumFractionDigits: 2 })} USD`;
    } else {
      cryptoErrors += 1;
    }

    if (fxOk) {
      lastUpdatedEl.textContent = `${new Date().toLocaleString('hu-HU')}`;
    }

    if (!fxOk) {
      statusEl.textContent = 'Hiba történt: a devizaárfolyam adatok nem tölthetők be.';
    } else if (cryptoErrors > 0) {
      statusEl.textContent = 'A kripto árfolyamok átmenetileg nem frissültek, de az intervallumváltás működik.';
    } else {
      statusEl.textContent = '';
    }
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
