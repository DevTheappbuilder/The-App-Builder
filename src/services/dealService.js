const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const { Deal } = require('../models/Deal');
const { generateNote } = require('./paymentService');

const ALLOWED_TRANSITIONS = {
  INITIATED: ['PAYMENT_PENDING', 'CANCELLED', 'DISPUTE'],
  PAYMENT_PENDING: ['PAID', 'CANCELLED', 'DISPUTE'],
  PAID: ['DELIVERED', 'DISPUTE'],
  DELIVERED: ['COMPLETED', 'DISPUTE'],
  COMPLETED: [],
  DISPUTE: [],
  CANCELLED: [],
};

async function createDeal({ buyerId, sellerId, product, amount, method, currency = 'USD', expiresAt }) {
  const deal = await Deal.create({
    dealId: `D-${uuidv4().split('-')[0].toUpperCase()}`,
    buyerId,
    sellerId,
    product,
    amount,
    currency,
    method,
    uniqueNote: generateNote(),
    expiresAt,
  });
  return deal;
}

async function updateStatus(dealId, newStatus) {
  const deal = await Deal.findOne({ dealId });
  if (!deal) throw new Error('Deal not found');
  const allowed = ALLOWED_TRANSITIONS[deal.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid transition: ${deal.status} -> ${newStatus}`);
  }
  deal.status = newStatus;
  if (newStatus === 'PAYMENT_PENDING' && !deal.lockedAt) deal.lockedAt = new Date();
  await deal.save();
  return deal;
}

function validateUserRole(deal, actorId, requiredRole) {
  if (requiredRole === 'buyer') return deal.buyerId === actorId;
  if (requiredRole === 'seller') return deal.sellerId === actorId;
  return deal.buyerId === actorId || deal.sellerId === actorId;
}

async function completeDeal(dealId, actorId, role) {
  const deal = await Deal.findOne({ dealId });
  if (!deal) throw new Error('Deal not found');
  if (deal.status !== 'DELIVERED') throw new Error('Deal is not ready for completion');

  if (role === 'buyer') deal.buyerConfirmedFinal = true;
  if (role === 'seller') deal.sellerConfirmedFinal = true;

  if (deal.buyerConfirmedFinal && deal.sellerConfirmedFinal) {
    deal.status = 'COMPLETED';
    await Promise.all([
      User.updateOne({ userId: deal.buyerId }, { $inc: { totalDeals: 1, reputation: 1 } }, { upsert: true }),
      User.updateOne({ userId: deal.sellerId }, { $inc: { totalDeals: 1, reputation: 1 } }, { upsert: true }),
    ]);
  }

  await deal.save();
  return deal;
}

async function expireDeals(now = new Date()) {
  const result = await Deal.updateMany(
    {
      status: { $in: ['INITIATED', 'PAYMENT_PENDING', 'PAID', 'DELIVERED'] },
      expiresAt: { $lte: now },
    },
    { $set: { status: 'CANCELLED' } }
  );

  return result.modifiedCount || 0;
}

module.exports = {
  createDeal,
  updateStatus,
  validateUserRole,
  completeDeal,
  expireDeals,
};
