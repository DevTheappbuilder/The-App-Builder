const { SlashCommandBuilder } = require('discord.js');
const { Deal } = require('../models/Deal');

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
  if (![deal.buyerId, deal.sellerId].includes(interaction.user.id)) {
    return interaction.reply({ content: 'You are not part of this deal.', ephemeral: true });
  }
  if (['COMPLETED', 'DISPUTE', 'CANCELLED'].includes(deal.status)) {
    return interaction.reply({ content: `Deal cannot be cancelled from status: ${deal.status}`, ephemeral: true });
  }

  deal.status = 'CANCELLED';
  await deal.save();
  return interaction.reply({ content: `Deal ${dealId} cancelled.`, ephemeral: true });
}

module.exports = { data, execute };
