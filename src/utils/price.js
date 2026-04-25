const axios = require('axios');

async function fetchLtcPrice() {
  const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: {
      ids: 'litecoin',
      vs_currencies: 'usd,inr',
    },
    timeout: 10000,
  });

  if (!data?.litecoin?.usd || !data?.litecoin?.inr) {
    throw new Error('Invalid CoinGecko response');
  }

  return {
    usd: data.litecoin.usd,
    inr: data.litecoin.inr,
  };
}

module.exports = { fetchLtcPrice };
