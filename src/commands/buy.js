const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const { createDeal } = require('../services/dealService');
const { dealSummaryEmbed } = require('../utils/embeds');
const { dealTimeoutMinutes } = require('../config');

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
      .addChoices(
        { name: 'UPI', value: 'UPI' },
        { name: 'LTC', value: 'LTC' },
        { name: 'USDT', value: 'USDT' }
      )
  )
  .addStringOption((o) =>
    o
      .setName('currency')
      .setDescription('Currency')
      .setRequired(false)
      .addChoices({ name: 'USD', value: 'USD' }, { name: 'INR', value: 'INR' })
  );

if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  const seller = interaction.options.getUser('seller', true);
  const product = interaction.options.getString('product', true);
  const amount = interaction.options.getNumber('amount', true);
  const method = interaction.options.getString('method', true);
  const currency = interaction.options.getString('currency') || 'USD';

  if (seller.bot || seller.id === interaction.user.id) {
    return interaction.reply({ content: 'Seller must be another human user.', ephemeral: true });
  }

  const deal = await createDeal({
    buyerId: interaction.user.id,
    sellerId: seller.id,
    product,
    amount,
    method,
    currency,
    expiresAt: new Date(Date.now() + dealTimeoutMinutes * 60 * 1000),
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm_deal:${deal.dealId}`).setLabel('Confirm Deal').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cancel_deal:${deal.dealId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`dispute:${deal.dealId}`).setLabel('Request Support').setStyle(ButtonStyle.Secondary)
  );

  const embed = dealSummaryEmbed(deal, 'Awaiting Seller Confirmation');
  let destinationMessage;

  if (interaction.inGuild() && interaction.channel?.isTextBased()) {
    const thread = await interaction.channel.threads.create({
      name: `deal-${deal.dealId.toLowerCase()}`,
      autoArchiveDuration: 60,
      type: ChannelType.PrivateThread,
      reason: `Deal ${deal.dealId}`,
      invitable: false,
    });
    await thread.members.add(interaction.user.id);
    await thread.members.add(seller.id);
    destinationMessage = await thread.send({ embeds: [embed], components: [row] });
    deal.threadChannelId = thread.id;
  } else {
    const buyerDm = await interaction.user.createDM();
    const sellerDm = await seller.createDM();
    destinationMessage = await sellerDm.send({ content: `Deal initiated by <@${interaction.user.id}>`, embeds: [embed], components: [row] });
    await buyerDm.send({ content: `Deal ${deal.dealId} created. Seller has been notified.` });
  }

  deal.messageId = destinationMessage.id;
  await deal.save();

  return interaction.reply({ content: `Deal created: **${deal.dealId}**`, ephemeral: true });
}

module.exports = { data, execute };
