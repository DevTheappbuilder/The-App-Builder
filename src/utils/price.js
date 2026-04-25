const axios = require('axios');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 32, ttl: 45_000 });

async function fetchRates() {
  const cached = cache.get('rates');
  if (cached) return cached;

  const [cg, fx] = await Promise.all([
    axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'litecoin,tether', vs_currencies: 'usd,inr' },
      timeout: 12000,
    }),
    axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 12000 }),
  ]);

  const rates = {
    ltcUsd: cg.data?.litecoin?.usd,
    ltcInr: cg.data?.litecoin?.inr,
    usdtUsd: cg.data?.tether?.usd || 1,
    usdtInr: cg.data?.tether?.inr,
    usdInr: fx.data?.rates?.INR,
    updatedAt: new Date(),
  };

  if (!rates.ltcUsd || !rates.ltcInr || !rates.usdInr) {
    throw new Error('Failed to fetch required market rates');
  }

  cache.set('rates', rates);
  return rates;
}

function applyBuffer(value, bufferPercent = 2) {
  return value * (1 + bufferPercent / 100);
}

async function convertAmount({ amount, from, to, bufferPercent = 0 }) {
  if (from === to) return { amount, updatedAt: new Date(), rawAmount: amount };
  const rates = await fetchRates();

  const toUsd = (value, currency) => {
    if (currency === 'USD') return value;
    if (currency === 'INR') return value / rates.usdInr;
    if (currency === 'LTC') return value * rates.ltcUsd;
    if (currency === 'USDT') return value * rates.usdtUsd;
    throw new Error(`Unsupported currency: ${currency}`);
  };

  const fromUsd = (value, currency) => {
    if (currency === 'USD') return value;
    if (currency === 'INR') return value * rates.usdInr;
    if (currency === 'LTC') return value / rates.ltcUsd;
    if (currency === 'USDT') return value / rates.usdtUsd;
    throw new Error(`Unsupported currency: ${currency}`);
  };

  const usdValue = toUsd(amount, from);
  const raw = fromUsd(usdValue, to);
  const buffered = applyBuffer(raw, bufferPercent);

  return {
    amount: Number(buffered.toFixed(to === 'LTC' ? 8 : 2)),
    rawAmount: Number(raw.toFixed(to === 'LTC' ? 8 : 2)),
    updatedAt: rates.updatedAt,
    rates,
  };
}

module.exports = { fetchRates, convertAmount, applyBuffer };
