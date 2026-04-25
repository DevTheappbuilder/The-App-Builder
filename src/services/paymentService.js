const { v4: uuidv4 } = require('uuid');
const { LRUCache } = require('lru-cache');
const User = require('../models/User');
const { convertAmount } = require('../utils/price');
const { priceBufferPercent } = require('../config');

const walletCache = new LRUCache({ max: 500, ttl: 60_000 });

function generateNote() {
  return `DRX-${uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

async function getWallet(userId, method) {
  const key = `${userId}:${method}`;
  const cached = walletCache.get(key);
  if (cached) return cached;

  const user = await User.findOne({ userId }).lean();
  if (!user) return null;

  const wallet = method === 'UPI' ? user.upiId : method === 'LTC' ? user.ltcAddress : user.usdtAddress;
  if (wallet) walletCache.set(key, wallet);
  return wallet;
}

async function createPaymentQuote({ amount, currency, method }) {
  if (method === 'UPI') {
    return {
      payAmount: amount,
      payCurrency: currency,
      fiatEquivalent: `${amount} ${currency}`,
      updatedAt: new Date(),
      buffered: false,
    };
  }

  const target = method === 'LTC' ? 'LTC' : 'USDT';
  const conversion = await convertAmount({ amount, from: currency, to: target, bufferPercent: priceBufferPercent });
  return {
    payAmount: conversion.amount,
    payCurrency: target,
    rawAmount: conversion.rawAmount,
    fiatEquivalent: `${amount} ${currency}`,
    updatedAt: conversion.updatedAt,
    buffered: true,
    bufferPercent: priceBufferPercent,
  };
}

module.exports = {
  generateNote,
  getWallet,
  createPaymentQuote,
};
