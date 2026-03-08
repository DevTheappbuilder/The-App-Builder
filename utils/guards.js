const cooldowns = new Map();

function checkAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 'Amount must be a positive number.';
  return null;
}

function checkCooldown(userId, command, ms = 1500) {
  const key = `${userId}:${command}`;
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < ms) return Math.ceil((ms - (now - last)) / 1000);
  cooldowns.set(key, now);
  return 0;
}

module.exports = { checkAmount, checkCooldown };
