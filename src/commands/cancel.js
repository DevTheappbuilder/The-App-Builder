const { SlashCommandBuilder } = require('discord.js');
const { Deal } = require('../models/Deal');
const { cancelDeal, validateUserRole } = require('../services/dealService');

const data = new SlashCommandBuilder()
  .setName('cancel')
  .setDescription('Cancel a deal you are part of')
  .addStringOption((o) => o.setName('dealid').setDescription('Deal ID').setRequired(true));
if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  const dealId = interaction.options.getString('dealid', true).trim().toUpperCase();
  const deal = await Deal.findOne({ dealId });
  if (!deal) return interaction.reply({ content: 'Deal not found.', ephemeral: true });
  if (!validateUserRole(deal, interaction.user.id)) {
    return interaction.reply({ content: 'You are not part of this deal.', ephemeral: true });
  }

  await cancelDeal(deal, interaction.user.id, 'Cancelled via slash command');
  return interaction.reply({ content: `Deal ${dealId} cancelled.`, ephemeral: true });
}

module.exports = { data, execute };
