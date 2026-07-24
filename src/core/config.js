const config = {
  bot: {
    name: process.env.BOT_NAME || 'Bot Name',
    version: process.env.BOT_VERSION || '1.0.0',
    owner: process.env.BOT_OWNER || '@owner-name'
  },
  ui: {
    dashboardWidth: Number(process.env.DASHBOARD_WIDTH || 96)
  },
  logging: {
    destination: process.env.LOG_DESTINATION || 'logs/bot-activity.log'
  }
};

export default config;
