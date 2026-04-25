const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const User = require('../models/User');
const { createDeal } = require('../services/dealService');
const { buildDealEmbed } = require('../utils/embeds');
const { sanitizeText } = require('../utils/validators');

const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Start a secure buyer/seller deal workflow')
  .addUserOption((o) => o.setName('seller').setDescription('Seller user').setRequired(true))
  .addStringOption((o) => o.setName('product').setDescription('Product/service details').setRequired(true))
  .addNumberOption((o) => o.setName('amount').setDescription('Deal amount').setRequired(true).setMinValue(0.01))
  .addStringOption((o) =>
    o
      .setName('method')
      .setDescription('Payment method')
      .setRequired(true)
      .addChoices({ name: 'UPI', value: 'UPI' }, { name: 'LTC', value: 'LTC' }, { name: 'USDT', value: 'USDT' })
  )
  .addStringOption((o) => o.setName('currency').setDescription('Currency').addChoices({ name: 'USD', value: 'USD' }, { name: 'INR', value: 'INR' }));

if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  const seller = interaction.options.getUser('seller', true);
  const product = sanitizeText(interaction.options.getString('product', true), 300);
  const amount = interaction.options.getNumber('amount', true);
  const method = interaction.options.getString('method', true);
  const currency = interaction.options.getString('currency') || 'USD';

  if (seller.bot || seller.id === interaction.user.id) {
    return interaction.reply({ content: 'Seller must be a different human user.', ephemeral: true });
  }

  const deal = await createDeal({ buyerId: interaction.user.id, sellerId: seller.id, product, amount, method, currency });
  const sellerProfile = await User.findOne({ userId: seller.id }).lean();
  const embed = buildDealEmbed({
    deal,
    title: 'Awaiting Seller Confirmation',
    instruction: 'Seller should confirm to lock terms and start payment phase.',
    sellerProfile,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm_deal:${deal.dealId}`).setLabel('Confirm Deal').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cancel_deal:${deal.dealId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`dispute:${deal.dealId}`).setLabel('Request Support').setStyle(ButtonStyle.Secondary)
  );

  let message;
  if (interaction.inGuild() && interaction.channel?.isTextBased()) {
    const thread = await interaction.channel.threads.create({
      name: `deal-${deal.dealId.toLowerCase()}`,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: 60,
      reason: `Escrow Deal ${deal.dealId}`,
    });
    await thread.members.add(interaction.user.id);
    await thread.members.add(seller.id);
    message = await thread.send({ embeds: [embed], components: [row] });
    deal.threadChannelId = thread.id;
  } else {
    const sellerDm = await seller.createDM();
    message = await sellerDm.send({ content: `Deal requested by <@${interaction.user.id}>`, embeds: [embed], components: [row] });
    await interaction.user.send(`Deal **${deal.dealId}** created and sent to seller.`).catch(() => null);
  }

  deal.messageId = message.id;
  await deal.save();
  return interaction.reply({ content: `Deal created: **${deal.dealId}**`, ephemeral: true });
}

module.exports = { data, execute };
