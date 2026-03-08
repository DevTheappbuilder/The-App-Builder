const crypto = require('crypto');
const { db, getOrCreateUser } = require('../database/db');

function getServerSeedState() {
  return db.prepare('SELECT * FROM fairness WHERE id = 1').get();
}

function getRoll(userId) {
  const user = getOrCreateUser(userId);
  const fair = getServerSeedState();
  const message = `${user.client_seed}:${user.nonce}`;
  const hash = crypto.createHmac('sha256', fair.server_seed).update(message).digest('hex');
  const int = parseInt(hash.slice(0, 13), 16);
  const randomFloat = int / 0x1fffffffffffff;

  db.prepare('UPDATE users SET nonce = nonce + 1 WHERE user_id = ?').run(userId);

  return {
    randomFloat,
    hash,
    nonceUsed: user.nonce,
    clientSeed: user.client_seed,
    serverSeedHash: fair.server_seed_hash,
  };
}

function setClientSeed(userId, clientSeed) {
  getOrCreateUser(userId);
  db.prepare('UPDATE users SET client_seed = ?, nonce = 0 WHERE user_id = ?').run(clientSeed, userId);
}

function rotateServerSeed() {
  const current = getServerSeedState();
  const newSeed = crypto.randomBytes(32).toString('hex');
  const newHash = crypto.createHash('sha256').update(newSeed).digest('hex');

  db.prepare(
    `UPDATE fairness
     SET previous_server_seed = ?,
         server_seed = ?,
         server_seed_hash = ?,
         rotated_at = ?
     WHERE id = 1`,
  ).run(current.server_seed, newSeed, newHash, Date.now());

  return {
    oldServerSeed: current.server_seed,
    newServerSeedHash: newHash,
  };
}

module.exports = { getRoll, getServerSeedState, setClientSeed, rotateServerSeed };
