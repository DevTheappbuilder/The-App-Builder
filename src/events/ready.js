const { REST, Routes } = require('discord.js');
const { clientId, token } = require('../config');
const { processTimeouts } = require('../services/dealService');
const logger = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    logger.info('bot_ready', { user: client.user.tag });

    const rest = new REST({ version: '10' }).setToken(token);
    const commandPayload = [...client.commands.values()].map((command) => command.data.toJSON());
    await rest.put(Routes.applicationCommands(clientId), { body: commandPayload });
    logger.info('commands_registered', { count: commandPayload.length });

    setInterval(async () => {
      try {
        const report = await processTimeouts();
        if (report.expiredCancelled || report.autoReleased) {
          logger.info('timeout_processor', report);
        }
      } catch (error) {
        logger.error('timeout_processor_failed', { message: error.message });
      }
    }, 60_000).unref();
  },
};
