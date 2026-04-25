const { checkCooldown } = require('../middleware/cooldown');
const { handleButton, handleModal } = require('../controllers/dealController');
const logger = require('../utils/logger');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const cooldown = checkCooldown(interaction.user.id, interaction.commandName);
        if (cooldown.limited) {
          return interaction.reply({ content: `Slow down. Retry in ${cooldown.retryIn}s.`, ephemeral: true });
        }

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        await handleButton(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }
    } catch (error) {
      logger.error('interaction_error', { message: error.message, stack: error.stack, userId: interaction.user?.id });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Something went wrong handling this interaction.', ephemeral: true });
      }
    }
  },
};
