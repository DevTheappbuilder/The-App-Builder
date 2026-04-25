const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const User = require('../models/User');
const { Deal } = require('../models/Deal');
const {
  validateUserRole,
  progressStage,
  completeDeal,
  cancelDeal,
  openDispute,
} = require('../services/dealService');
const { createPaymentQuote, getWallet } = require('../services/paymentService');
const { buildDealEmbed, buildSupportEmbed } = require('../utils/embeds');
const { parseDealButton, assertHttpUrl } = require('../utils/validators');
const { supportInvite, supportChannelId } = require('../config');

function disabledRowsFrom(message) {
  return message.components.map((row) =>
    ActionRowBuilder.from(row).setComponents(row.components.map((c) => ButtonBuilder.from(c).setDisabled(true)))
  );
}

function activeRow(deal, buttons) {
  return [
    new ActionRowBuilder().addComponents(
      ...buttons,
      new ButtonBuilder().setCustomId(`dispute:${deal.dealId}`).setLabel('Request Support').setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function fetchSellerProfile(sellerId) {
  return User.findOne({ userId: sellerId }).lean();
}

async function handleButton(interaction) {
  const parsed = parseDealButton(interaction.customId);
  if (!parsed) return false;

  const { action, dealId } = parsed;
  const deal = await Deal.findOne({ dealId });
  if (!deal) {
    await interaction.reply({ content: 'Deal not found.', ephemeral: true });
    return true;
  }

  if (deal.status === 'DISPUTE') {
    await interaction.reply({ content: 'Deal is frozen in dispute.', ephemeral: true });
    return true;
  }

  if (action === 'confirm_deal') {
    if (!validateUserRole(deal, interaction.user.id, 'seller')) {
      await interaction.reply({ content: 'Only seller can confirm.', ephemeral: true });
      return true;
    }

    await progressStage(deal, {
      actorId: interaction.user.id,
      nextStage: 'LOCKED',
      status: 'PAYMENT_PENDING',
      detail: 'Seller confirmed and lock applied',
    });
    await progressStage(deal, {
      actorId: interaction.user.id,
      nextStage: 'PAYMENT',
      status: 'PAYMENT_PENDING',
      detail: 'Waiting for buyer payment',
    });

    const wallet = await getWallet(deal.sellerId, deal.method);
    const quote = await createPaymentQuote({ amount: deal.amount, currency: deal.currency, method: deal.method });
    const sellerProfile = await fetchSellerProfile(deal.sellerId);
    const embed = buildDealEmbed({
      deal,
      title: 'Payment Stage',
      instruction: `Buyer pays **${quote.payAmount} ${quote.payCurrency}** (${quote.fiatEquivalent}). Price buffer: ${quote.buffered ? `${quote.bufferPercent}%` : 'none'}. Last rate update: ${new Date(quote.updatedAt).toISOString()}. Wallet: ${wallet || 'Not set'}`,
      sellerProfile,
    });

    return interaction.update({
      embeds: [embed],
      components: activeRow(deal, [
        new ButtonBuilder().setCustomId(`paid:${dealId}`).setLabel('I Paid').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cancel_deal:${dealId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
      ]),
    });
  }

  if (action === 'paid') {
    if (!validateUserRole(deal, interaction.user.id, 'buyer')) {
      await interaction.reply({ content: 'Only buyer can click I Paid.', ephemeral: true });
      return true;
    }

    const modal = new ModalBuilder().setCustomId(`submit_proof:${dealId}`).setTitle('Submit Payment Proof');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('proof_url')
          .setLabel('Payment proof URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (action === 'confirm_payment') {
    if (!validateUserRole(deal, interaction.user.id, 'seller')) {
      await interaction.reply({ content: 'Only seller can confirm payment.', ephemeral: true });
      return true;
    }
    deal.paymentConfirmedBySeller = true;
    deal.status = 'DELIVERED';
    await progressStage(deal, { actorId: interaction.user.id, nextStage: 'DELIVERY', status: 'DELIVERED', detail: 'Payment confirmed' });

    const sellerProfile = await fetchSellerProfile(deal.sellerId);
    return interaction.update({
      embeds: [buildDealEmbed({ deal, title: 'Delivery Stage', instruction: 'Seller should deliver now and click Delivered.', sellerProfile })],
      components: activeRow(deal, [
        new ButtonBuilder().setCustomId(`delivered:${dealId}`).setLabel('Delivered').setStyle(ButtonStyle.Primary),
      ]),
    });
  }

  if (action === 'delivered') {
    if (!validateUserRole(deal, interaction.user.id, 'seller')) {
      await interaction.reply({ content: 'Only seller can mark Delivered.', ephemeral: true });
      return true;
    }
    deal.deliveryConfirmedBySeller = true;
    deal.status = 'DELIVERED';
    await deal.save();
    const sellerProfile = await fetchSellerProfile(deal.sellerId);
    return interaction.update({
      embeds: [buildDealEmbed({ deal, title: 'Buyer Confirmation', instruction: 'Buyer: click Confirm Received if delivery is correct.', sellerProfile })],
      components: activeRow(deal, [
        new ButtonBuilder().setCustomId(`confirm_received:${dealId}`).setLabel('Confirm Received').setStyle(ButtonStyle.Success),
      ]),
    });
  }

  if (action === 'confirm_received') {
    if (!validateUserRole(deal, interaction.user.id, 'buyer')) {
      await interaction.reply({ content: 'Only buyer can confirm receipt.', ephemeral: true });
      return true;
    }

    deal.deliveryConfirmedByBuyer = true;
    await progressStage(deal, { actorId: interaction.user.id, nextStage: 'FINAL', status: 'DELIVERED', detail: 'Buyer confirmed receipt' });
    await completeDeal(deal, interaction.user.id, 'buyer');

    const sellerProfile = await fetchSellerProfile(deal.sellerId);
    return interaction.update({
      embeds: [buildDealEmbed({ deal, title: 'Final Confirmation', instruction: 'Seller must run /confirm to close the deal.', sellerProfile })],
      components: activeRow(deal, [
        new ButtonBuilder().setCustomId(`awaiting_seller:${dealId}`).setLabel('Awaiting seller /confirm').setStyle(ButtonStyle.Secondary).setDisabled(true),
      ]),
    });
  }

  if (action === 'cancel_deal') {
    if (!validateUserRole(deal, interaction.user.id)) {
      await interaction.reply({ content: 'Not allowed.', ephemeral: true });
      return true;
    }
    await cancelDeal(deal, interaction.user.id, 'Cancelled by participant');
    const sellerProfile = await fetchSellerProfile(deal.sellerId);
    return interaction.update({ embeds: [buildDealEmbed({ deal, title: 'Deal Cancelled', instruction: 'Deal closed.', sellerProfile })], components: [] });
  }

  if (action === 'dispute') {
    if (!validateUserRole(deal, interaction.user.id)) {
      await interaction.reply({ content: 'Not allowed.', ephemeral: true });
      return true;
    }

    await openDispute(deal, interaction.user.id, 'Manual support request');

    if (supportChannelId) {
      const supportChannel = await interaction.client.channels.fetch(supportChannelId).catch(() => null);
      if (supportChannel?.isTextBased()) {
        await supportChannel.send({ embeds: [buildSupportEmbed(deal)] });
      }
    }

    await interaction.update({
      embeds: [buildSupportEmbed(deal)],
      components: disabledRowsFrom(interaction.message),
    });
    await interaction.followUp({ content: `Support requested. Join: ${supportInvite}`, ephemeral: true });
    return true;
  }

  return false;
}

async function handleModal(interaction) {
  const [action, dealId] = interaction.customId.split(':');
  if (action !== 'submit_proof') return false;

  const deal = await Deal.findOne({ dealId });
  if (!deal) {
    await interaction.reply({ content: 'Deal not found.', ephemeral: true });
    return true;
  }

  if (!validateUserRole(deal, interaction.user.id, 'buyer')) {
    await interaction.reply({ content: 'Only buyer can submit proof.', ephemeral: true });
    return true;
  }

  const proof = interaction.fields.getTextInputValue('proof_url').trim();
  if (!assertHttpUrl(proof)) {
    await interaction.reply({ content: 'Proof must be an HTTP/HTTPS URL.', ephemeral: true });
    return true;
  }

  deal.paymentProof = proof;
  deal.status = 'PAID';
  deal.activityLog.push({ actorId: interaction.user.id, action: 'PAYMENT_PROOF', detail: proof, at: new Date() });
  await deal.save();

  const sellerProfile = await fetchSellerProfile(deal.sellerId);
  await interaction.reply({
    embeds: [buildDealEmbed({ deal, title: 'Payment Submitted', instruction: 'Seller: confirm payment receipt.', sellerProfile })],
    components: activeRow(deal, [
      new ButtonBuilder().setCustomId(`confirm_payment:${dealId}`).setLabel('Payment Received ✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dispute:${dealId}`).setLabel('Not Received / Support').setStyle(ButtonStyle.Danger),
    ]),
  });
  return true;
}

module.exports = {
  handleButton,
  handleModal,
};
