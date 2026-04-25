const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const { Deal } = require('../models/Deal');
const { generateNote } = require('./paymentService');
const { dealTimeoutMinutes, paymentTimeoutMinutes, finalizationTimeoutMinutes, autoReleaseMinutes } = require('../config');

const TRANSITIONS = {
  INIT: ['LOCKED', 'CANCELLED', 'DISPUTE'],
  LOCKED: ['PAYMENT', 'CANCELLED', 'DISPUTE'],
  PAYMENT: ['DELIVERY', 'CANCELLED', 'DISPUTE'],
  DELIVERY: ['FINAL', 'DISPUTE'],
  FINAL: ['COMPLETE', 'DISPUTE'],
  COMPLETE: [],
};

function addActivity(deal, actorId, action, detail = '') {
  deal.activityLog.push({ actorId, action, detail, at: new Date() });
}

async function createDeal({ buyerId, sellerId, product, amount, method, currency = 'USD' }) {
  const recentDupe = await Deal.findOne({
    buyerId,
    sellerId,
    product,
    amount,
    method,
    createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    status: { $nin: ['CANCELLED', 'COMPLETED'] },
  });
  if (recentDupe) throw new Error(`Duplicate deal detected: ${recentDupe.dealId}`);

  const deal = await Deal.create({
    dealId: `D-${uuidv4().split('-')[0].toUpperCase()}`,
    buyerId,
    sellerId,
    product,
    amount,
    currency,
    method,
    stage: 'INIT',
    status: 'INITIATED',
    isLocked: false,
    uniqueNote: generateNote(),
    expiresAt: new Date(Date.now() + dealTimeoutMinutes * 60 * 1000),
    autoReleaseAt: new Date(Date.now() + autoReleaseMinutes * 60 * 1000),
    activityLog: [{ actorId: buyerId, action: 'DEAL_CREATED', detail: 'Buyer started deal', at: new Date() }],
  });

  return deal;
}

function validateUserRole(deal, actorId, requiredRole) {
  if (requiredRole === 'buyer') return deal.buyerId === actorId;
  if (requiredRole === 'seller') return deal.sellerId === actorId;
  return deal.buyerId === actorId || deal.sellerId === actorId;
}

async function progressStage(deal, { actorId, nextStage, status, detail }) {
  if (!TRANSITIONS[deal.stage]?.includes(nextStage)) {
    throw new Error(`Invalid stage transition ${deal.stage} -> ${nextStage}`);
  }

  deal.stage = nextStage;
  if (status) deal.status = status;

  if (nextStage === 'LOCKED') {
    deal.isLocked = true;
    deal.lockedAt = new Date();
    deal.expiresAt = new Date(Date.now() + paymentTimeoutMinutes * 60 * 1000);
  }

  if (nextStage === 'FINAL') {
    deal.expiresAt = new Date(Date.now() + finalizationTimeoutMinutes * 60 * 1000);
  }

  addActivity(deal, actorId, `STAGE_${nextStage}`, detail || '');
  await deal.save();
  return deal;
}

async function completeDeal(deal, actorId, role) {
  if (deal.stage !== 'FINAL') throw new Error('Deal not in final stage');

  if (role === 'buyer') deal.buyerConfirmedFinal = true;
  if (role === 'seller') deal.sellerConfirmedFinal = true;

  addActivity(deal, actorId, 'FINAL_CONFIRM', role);

  if (deal.buyerConfirmedFinal && deal.sellerConfirmedFinal) {
    deal.stage = 'COMPLETE';
    deal.status = 'COMPLETED';
    addActivity(deal, actorId, 'DEAL_COMPLETED', 'Mutual confirmation');
    await Promise.all([
      User.updateOne(
        { userId: deal.buyerId },
        { $inc: { totalDeals: 1, completedDeals: 1, reputation: 1 }, $set: { ratingScore: 5 } },
        { upsert: true }
      ),
      User.updateOne(
        { userId: deal.sellerId },
        { $inc: { totalDeals: 1, completedDeals: 1, reputation: 1 }, $set: { ratingScore: 5 } },
        { upsert: true }
      ),
    ]);
  }

  await deal.save();
  return deal;
}

async function cancelDeal(deal, actorId, reason = 'Cancelled') {
  if (['COMPLETED', 'CANCELLED'].includes(deal.status)) return deal;
  deal.status = 'CANCELLED';
  deal.stage = deal.stage === 'COMPLETE' ? 'COMPLETE' : deal.stage;
  addActivity(deal, actorId, 'DEAL_CANCELLED', reason);
  await Promise.all([
    User.updateOne({ userId: deal.buyerId }, { $inc: { cancelledDeals: 1 } }, { upsert: true }),
    User.updateOne({ userId: deal.sellerId }, { $inc: { cancelledDeals: 1 } }, { upsert: true }),
  ]);
  await deal.save();
  return deal;
}

async function openDispute(deal, actorId, reason = 'Support requested') {
  deal.status = 'DISPUTE';
  deal.isLocked = true;
  addActivity(deal, actorId, 'DISPUTE_OPENED', reason);
  await Promise.all([
    User.updateOne({ userId: deal.buyerId }, { $inc: { disputes: 1 } }, { upsert: true }),
    User.updateOne({ userId: deal.sellerId }, { $inc: { disputes: 1 } }, { upsert: true }),
  ]);
  await deal.save();
  return deal;
}

async function processTimeouts() {
  const now = new Date();

  const stale = await Deal.find({
    status: { $in: ['INITIATED', 'PAYMENT_PENDING', 'PAID', 'DELIVERED'] },
    expiresAt: { $lte: now },
  });

  for (const deal of stale) {
    await cancelDeal(deal, 'system', 'Expired by timeout');
  }

  const autoRelease = await Deal.find({
    stage: 'FINAL',
    status: { $nin: ['COMPLETED', 'CANCELLED', 'DISPUTE'] },
    autoReleaseAt: { $lte: now },
  });

  for (const deal of autoRelease) {
    deal.sellerConfirmedFinal = true;
    deal.buyerConfirmedFinal = true;
    deal.stage = 'COMPLETE';
    deal.status = 'COMPLETED';
    addActivity(deal, 'system', 'AUTO_RELEASE', 'Auto-complete due to inactivity');
    await deal.save();
  }

  return { expiredCancelled: stale.length, autoReleased: autoRelease.length };
}

async function adminResolve(deal, actorId, action) {
  if (action === 'resolve') {
    deal.status = 'CANCELLED';
    addActivity(deal, actorId, 'ADMIN_RESOLVE', 'Deal resolved/cancelled by admin');
  } else if (action === 'refund') {
    deal.status = 'CANCELLED';
    addActivity(deal, actorId, 'ADMIN_REFUND', 'Refund instructed by admin');
  } else if (action === 'force_complete') {
    deal.stage = 'COMPLETE';
    deal.status = 'COMPLETED';
    deal.buyerConfirmedFinal = true;
    deal.sellerConfirmedFinal = true;
    addActivity(deal, actorId, 'ADMIN_FORCE_COMPLETE', 'Admin forced completion');
  }

  await deal.save();
  return deal;
}

async function getStats() {
  const [total, completed, cancelled, disputes, topMethods] = await Promise.all([
    Deal.countDocuments(),
    Deal.countDocuments({ status: 'COMPLETED' }),
    Deal.countDocuments({ status: 'CANCELLED' }),
    Deal.countDocuments({ status: 'DISPUTE' }),
    Deal.aggregate([{ $group: { _id: '$method', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 1 }]),
  ]);

  const successRate = total === 0 ? 0 : Number(((completed / total) * 100).toFixed(2));
  return {
    total,
    completed,
    cancelled,
    disputes,
    successRate,
    topMethod: topMethods[0]?._id || 'N/A',
  };
}

module.exports = {
  createDeal,
  validateUserRole,
  progressStage,
  completeDeal,
  cancelDeal,
  openDispute,
  processTimeouts,
  adminResolve,
  getStats,
};
