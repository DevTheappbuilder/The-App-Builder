const { db, getOrCreateUser } = require('./db');

const TARGET_RTP = 0.96;
const JACKPOT_RATE = 0.01;

function getUser(userId) {
  return getOrCreateUser(userId);
}

function changeBalance(userId, amount) {
  const user = getOrCreateUser(userId);
  const next = user.balance + amount;
  if (next < 0) return null;
  db.prepare('UPDATE users SET balance = ? WHERE user_id = ?').run(next, userId);
  return next;
}

function setBalance(userId, amount) {
  getOrCreateUser(userId);
  db.prepare('UPDATE users SET balance = ? WHERE user_id = ?').run(amount, userId);
}

function recordBet(userId, wager, payout) {
  const jackpotAdd = wager * JACKPOT_RATE;
  db.prepare('UPDATE house SET total_wagered = total_wagered + ?, total_paid = total_paid + ?, jackpot = jackpot + ? WHERE id = 1').run(
    wager,
    payout,
    jackpotAdd,
  );

  db.prepare(
    `UPDATE users
     SET total_wagered = total_wagered + ?,
         total_won = total_won + ?,
         wins = wins + ?,
         losses = losses + ?
     WHERE user_id = ?`,
  ).run(wager, payout, payout > 0 ? 1 : 0, payout > 0 ? 0 : 1, userId);
}

function getHouse() {
  return db.prepare('SELECT * FROM house WHERE id = 1').get();
}

function getDynamicRtpFactor() {
  const house = getHouse();
  if (!house.total_wagered) return 1;
  const currentRtp = house.total_paid / house.total_wagered;
  const drift = TARGET_RTP - currentRtp;
  const adjustment = 1 + Math.max(-0.03, Math.min(0.03, drift));
  return adjustment;
}

module.exports = {
  TARGET_RTP,
  JACKPOT_RATE,
  getUser,
  changeBalance,
  setBalance,
  recordBet,
  getHouse,
  getDynamicRtpFactor,
};
