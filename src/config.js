const REQUIRED = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'MONGO_URI'];

function assertConfig(env = process.env) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  mongoUri: process.env.MONGO_URI,
  supportInvite: process.env.SUPPORT_SERVER_INVITE || 'https://discord.gg/support',
  supportChannelId: process.env.SUPPORT_CHANNEL_ID || null,
  adminRoleIds: (process.env.ADMIN_ROLE_IDS || '').split(',').map((x) => x.trim()).filter(Boolean),
  dealTimeoutMinutes: Number(process.env.DEAL_TIMEOUT_MINUTES || 20),
  paymentTimeoutMinutes: Number(process.env.PAYMENT_TIMEOUT_MINUTES || 30),
  finalizationTimeoutMinutes: Number(process.env.FINALIZATION_TIMEOUT_MINUTES || 120),
  autoReleaseMinutes: Number(process.env.AUTO_RELEASE_MINUTES || 180),
  commandCooldownSeconds: Number(process.env.COMMAND_COOLDOWN_SECONDS || 3),
  priceBufferPercent: Number(process.env.PRICE_BUFFER_PERCENT || 2),
  assertConfig,
};
