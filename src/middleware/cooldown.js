const { commandCooldownSeconds } = require('../config');

const tracker = new Map();

function checkCooldown(userId, commandName) {
  const key = `${userId}:${commandName}`;
  const now = Date.now();
  const expireAt = tracker.get(key) || 0;
  if (expireAt > now) {
    const retryIn = Math.ceil((expireAt - now) / 1000);
    return { limited: true, retryIn };
  }

  tracker.set(key, now + commandCooldownSeconds * 1000);
  return { limited: false };
}

module.exports = { checkCooldown };
