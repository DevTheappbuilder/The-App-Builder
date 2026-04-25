const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { Deal } = require('../models/Deal');
const Invoice = require('../models/Invoice');
const { validateUserRole } = require('../services/dealService');

const data = new SlashCommandBuilder()
  .setName('invoice')
  .setDescription('Invoice operations')
  .addSubcommand((s) => s.setName('create').setDescription('Create invoice from deal').addStringOption((o) => o.setName('dealid').setDescription('Deal ID').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('List your recent invoices'));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const deal = await Deal.findOne({ dealId: interaction.options.getString('dealid', true).toUpperCase() });
    if (!deal) return interaction.reply({ content: 'Deal not found.', ephemeral: true });
    if (!validateUserRole(deal, interaction.user.id)) {
      return interaction.reply({ content: 'You are not part of this deal.', ephemeral: true });
    }

    const invoiceId = `INV-${uuidv4().split('-')[0].toUpperCase()}`;
    const content = `Invoice ${invoiceId}\nDeal: ${deal.dealId}\nBuyer: ${deal.buyerId}\nSeller: ${deal.sellerId}\nAmount: ${deal.amount} ${deal.currency}\nMethod: ${deal.method}\nStatus: ${deal.status}/${deal.stage}`;

    const invoice = await Invoice.create({
      invoiceId,
      dealId: deal.dealId,
      createdBy: interaction.user.id,
      buyerId: deal.buyerId,
      sellerId: deal.sellerId,
      amount: deal.amount,
      currency: deal.currency,
      method: deal.method,
      statusSnapshot: deal.status,
      stageSnapshot: deal.stage,
      content,
    });

    return interaction.reply({ content: `Invoice created: **${invoice.invoiceId}**\n\`\`\`\n${content}\n\`\`\``, ephemeral: true });
  }

  const invoices = await Invoice.find({ createdBy: interaction.user.id }).sort({ createdAt: -1 }).limit(10).lean();
  if (!invoices.length) return interaction.reply({ content: 'No invoices found.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Recent Invoices')
    .setDescription(invoices.map((i) => `• **${i.invoiceId}** — Deal ${i.dealId} — ${i.amount} ${i.currency}`).join('\n'));

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data, execute };
