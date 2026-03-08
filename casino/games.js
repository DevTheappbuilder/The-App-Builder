const { getRoll } = require('../fairness/provablyFair');
const { TARGET_RTP, getDynamicRtpFactor, getUser, changeBalance, recordBet } = require('../database/economy');

function ensureBankroll(userId, amount) {
  const user = getUser(userId);
  if (user.balance < amount) return false;
  changeBalance(userId, -amount);
  return true;
}

function settleGame(userId, wager, payout) {
  if (payout > 0) changeBalance(userId, payout);
  recordBet(userId, wager, payout);
}

function rtpAdjusted(base) {
  return base * getDynamicRtpFactor();
}

module.exports = { getRoll, TARGET_RTP, ensureBankroll, settleGame, rtpAdjusted };
