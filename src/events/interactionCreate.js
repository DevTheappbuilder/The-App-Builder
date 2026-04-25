const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { Deal } = require('../models/Deal');
const { updateStatus, validateUserRole, completeDeal } = require('../services/dealService');
const { convertCurrency, getWallet } = require('../services/paymentService');
const { dealSummaryEmbed, paymentStageEmbed, disputeEmbed } = require('../utils/embeds');
const { parseDealButton } = require('../utils/validators');
const { supportInvite } = require('../config');

function ensureActiveDeal(deal) {
  if (!deal) throw new Error('Deal not found');
  if (['CANCELLED', 'COMPLETED', 'DISPUTE'].includes(deal.status)) {
    throw new Error(`Deal is locked due to status: ${deal.status}`);
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        const parsed = parseDealButton(interaction.customId);
        if (!parsed) return;
        const { action, dealId } = parsed;
        const deal = await Deal.findOne({ dealId });
        ensureActiveDeal(deal);

        if (deal.expiresAt <= new Date()) {
          deal.status = 'CANCELLED';
          await deal.save();
          return interaction.reply({ content: 'Deal has expired and was cancelled.', ephemeral: true });
        }

        if (action === 'confirm_deal') {
          if (!validateUserRole(deal, interaction.user.id, 'seller')) {
            return interaction.reply({ content: 'Only the seller can confirm this deal.', ephemeral: true });
          }

          await updateStatus(dealId, 'PAYMENT_PENDING');
          const updated = await Deal.findOne({ dealId });
          const wallet = await getWallet(updated.sellerId, updated.method);
          const converted = await convertCurrency(updated.amount, updated.method, updated.currency);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`paid:${dealId}`).setLabel('I Paid').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`cancel_deal:${dealId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`dispute:${dealId}`).setLabel('Request Support').setStyle(ButtonStyle.Secondary)
          );
          const embed = paymentStageEmbed(updated, wallet || 'Seller has not set wallet yet');
          if (updated.method === 'LTC') {
            embed.addFields({ name: 'Approx LTC', value: `${converted.convertedAmount} LTC` });
          }
          return interaction.update({ embeds: [embed], components: [row] });
        }

        if (action === 'paid') {
          if (!validateUserRole(deal, interaction.user.id, 'buyer')) {
            return interaction.reply({ content: 'Only buyer can submit payment.', ephemeral: true });
          }
          if (deal.status !== 'PAYMENT_PENDING') {
            return interaction.reply({ content: 'Payment action is not valid now.', ephemeral: true });
          }

          const modal = new ModalBuilder().setCustomId(`submit_proof:${dealId}`).setTitle('Submit Payment Proof');
          const proofInput = new TextInputBuilder()
            .setCustomId('proof_url')
            .setLabel('Payment screenshot URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('https://...');

          modal.addComponents(new ActionRowBuilder().addComponents(proofInput));
          return interaction.showModal(modal);
        }

        if (action === 'confirm_payment') {
          if (!validateUserRole(deal, interaction.user.id, 'seller')) {
            return interaction.reply({ content: 'Only seller can confirm payment.', ephemeral: true });
          }
          if (deal.status !== 'PAID') {
            return interaction.reply({ content: 'Deal is not in PAID stage.', ephemeral: true });
          }

          deal.paymentConfirmedBySeller = true;
          deal.status = 'DELIVERED';
          await deal.save();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`delivered:${dealId}`).setLabel('Delivered').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`dispute:${dealId}`).setLabel('Request Support').setStyle(ButtonStyle.Secondary)
          );

          return interaction.update({ embeds: [dealSummaryEmbed(deal, 'Payment Confirmed, Deliver Product')], components: [row] });
        }

        if (action === 'delivered') {
          if (!validateUserRole(deal, interaction.user.id, 'seller')) {
            return interaction.reply({ content: 'Only seller can mark delivered.', ephemeral: true });
          }
          if (deal.status !== 'DELIVERED') {
            return interaction.reply({ content: 'Deal is not in delivered stage yet.', ephemeral: true });
          }

          deal.deliveryConfirmedBySeller = true;
          await deal.save();
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`confirm_received:${dealId}`).setLabel('Confirm Received').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`dispute:${dealId}`).setLabel('Request Support').setStyle(ButtonStyle.Secondary)
          );

          return interaction.update({ embeds: [dealSummaryEmbed(deal, 'Buyer Confirmation Required')], components: [row] });
        }

        if (action === 'confirm_received') {
          if (!validateUserRole(deal, interaction.user.id, 'buyer')) {
            return interaction.reply({ content: 'Only buyer can confirm receiving delivery.', ephemeral: true });
          }
          if (deal.status !== 'DELIVERED') {
            return interaction.reply({ content: 'Invalid stage for buyer confirmation.', ephemeral: true });
          }

          if (deal.deliveryConfirmedByBuyer) {
            return interaction.reply({ content: 'Already confirmed.', ephemeral: true });
          }

          deal.deliveryConfirmedByBuyer = true;
          await deal.save();

          const updated = await completeDeal(dealId, interaction.user.id, 'buyer');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`seller_finalize:${dealId}`).setLabel('Seller Finalize via /confirm').setStyle(ButtonStyle.Secondary).setDisabled(true)
          );
          return interaction.update({ embeds: [dealSummaryEmbed(updated, 'Buyer Confirmed. Seller must run /confirm')], components: [row] });
        }

        if (action === 'cancel_deal') {
          if (!validateUserRole(deal, interaction.user.id)) {
            return interaction.reply({ content: 'You are not allowed to cancel this deal.', ephemeral: true });
          }
          deal.status = 'CANCELLED';
          await deal.save();
          return interaction.update({ embeds: [dealSummaryEmbed(deal, 'Deal Cancelled')], components: [] });
        }

        if (action === 'dispute') {
          if (!validateUserRole(deal, interaction.user.id)) {
            return interaction.reply({ content: 'You are not part of this deal.', ephemeral: true });
          }
          deal.status = 'DISPUTE';
          await deal.save();
          return interaction.update({ embeds: [disputeEmbed(deal, supportInvite)], components: [] });
        }

        if (action === 'not_received') {
          if (!validateUserRole(deal, interaction.user.id, 'seller')) {
            return interaction.reply({ content: 'Only seller can mark this.', ephemeral: true });
          }
          return interaction.reply({ content: 'Please use Request Support to dispute missing payment.', ephemeral: true });
        }

        return;
      }

      if (interaction.isModalSubmit()) {
        const [action, dealId] = interaction.customId.split(':');
        if (action !== 'submit_proof') return;

        const proofUrl = interaction.fields.getTextInputValue('proof_url').trim();
        const deal = await Deal.findOne({ dealId });
        ensureActiveDeal(deal);

        if (!validateUserRole(deal, interaction.user.id, 'buyer')) {
          return interaction.reply({ content: 'Only buyer can submit payment proof.', ephemeral: true });
        }
        if (deal.status !== 'PAYMENT_PENDING') {
          return interaction.reply({ content: 'Deal is not awaiting payment.', ephemeral: true });
        }
        if (!/^https?:\/\//i.test(proofUrl)) {
          return interaction.reply({ content: 'Provide a valid proof URL.', ephemeral: true });
        }

        deal.paymentProof = proofUrl;
        deal.status = 'PAID';
        await deal.save();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`confirm_payment:${dealId}`).setLabel('Payment Received ✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`not_received:${dealId}`).setLabel('Not Received ❌').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`dispute:${dealId}`).setLabel('Request Support').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          embeds: [dealSummaryEmbed(deal, 'Payment Proof Submitted')],
          components: [row],
        });
      }
    } catch (error) {
      console.error('Interaction error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
      }
    }
  },
};
