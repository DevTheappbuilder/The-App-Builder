const { SlashCommandBuilder } = require('discord.js');
const { Deal } = require('../models/Deal');
const { completeDeal } = require('../services/dealService');

const data = new SlashCommandBuilder()
  .setName('confirm')
  .setDescription('Confirm final completion for a delivered deal')
  .addStringOption((o) => o.setName('dealid').setDescription('Deal ID').setRequired(true));
if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  const dealId = interaction.options.getString('dealid', true).trim().toUpperCase();
  const deal = await Deal.findOne({ dealId });
  if (!deal) return interaction.reply({ content: 'Deal not found.', ephemeral: true });

  if (interaction.user.id === deal.sellerId) {
    await completeDeal(deal, interaction.user.id, 'seller');
  } else if (interaction.user.id === deal.buyerId) {
    await completeDeal(deal, interaction.user.id, 'buyer');
  } else {
    return interaction.reply({ content: 'You are not part of this deal.', ephemeral: true });
  }

  return interaction.reply({ content: `Confirmation stored for ${dealId}. Current status: ${deal.status}/${deal.stage}`, ephemeral: true });
}

module.exports = { data, execute };
