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
  dealTimeoutMinutes: Number(process.env.DEAL_TIMEOUT_MINUTES || 45),
  assertConfig,
};
