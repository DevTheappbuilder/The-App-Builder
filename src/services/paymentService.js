const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const { fetchLtcPrice } = require('../utils/price');

function generateNote() {
  return `DRX-${uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

async function convertCurrency(amount, method, currency) {
  if (method !== 'LTC') {
    return { originalAmount: amount, convertedAmount: amount, unit: currency };
  }

  const prices = await fetchLtcPrice();
  const price = currency === 'INR' ? prices.inr : prices.usd;
  return {
    originalAmount: amount,
    convertedAmount: Number((amount / price).toFixed(8)),
    unit: 'LTC',
    reference: prices,
  };
}

async function getWallet(userId, method) {
  const user = await User.findOne({ userId });
  if (!user) return null;
  if (method === 'UPI') return user.upiId;
  if (method === 'LTC') return user.ltcAddress;
  if (method === 'USDT') return user.usdtAddress;
  return null;
}

module.exports = {
  generateNote,
  convertCurrency,
  getWallet,
};
