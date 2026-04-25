const { REST, Routes } = require('discord.js');
const { clientId, token } = require('../config');
const { expireDeals } = require('../services/dealService');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(token);
    const commandPayload = [...client.commands.values()].map((command) => command.data.toJSON());

    await rest.put(Routes.applicationCommands(clientId), { body: commandPayload });
    console.log(`Registered ${commandPayload.length} global slash commands.`);

    setInterval(async () => {
      try {
        const expired = await expireDeals();
        if (expired > 0) console.log(`Auto-cancelled ${expired} expired deals.`);
      } catch (error) {
        console.error('Failed expiring deals:', error.message);
      }
    }, 60_000).unref();
  },
};
