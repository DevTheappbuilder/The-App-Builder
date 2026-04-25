const { SlashCommandBuilder } = require('discord.js');
const { Deal } = require('../models/Deal');
const { adminResolve } = require('../services/dealService');
const { adminRoleIds } = require('../config');

const data = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('Admin: resolve/cancel a disputed deal')
  .addStringOption((o) => o.setName('dealid').setDescription('Deal ID').setRequired(true));

function isAdmin(interaction) {
  return interaction.member?.roles?.cache?.some((r) => adminRoleIds.includes(r.id));
}

async function execute(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ content: 'Admin only.', ephemeral: true });
  const deal = await Deal.findOne({ dealId: interaction.options.getString('dealid', true).toUpperCase() });
  if (!deal) return interaction.reply({ content: 'Deal not found.', ephemeral: true });
  await adminResolve(deal, interaction.user.id, 'resolve');
  return interaction.reply({ content: `Deal ${deal.dealId} resolved/cancelled.`, ephemeral: true });
}

module.exports = { data, execute };
