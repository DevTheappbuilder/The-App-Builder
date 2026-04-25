const { EmbedBuilder } = require('discord.js');

const COLORS = {
  PENDING: 0xf1c40f,
  PROGRESS: 0x3498db,
  DONE: 0x2ecc71,
  FAIL: 0xe74c3c,
};

function dealSummaryEmbed(deal, title = 'Deal Workflow') {
  return new EmbedBuilder()
    .setColor(colorByStatus(deal.status))
    .setTitle(title)
    .addFields(
      { name: 'Deal ID', value: `\`${deal.dealId}\``, inline: true },
      { name: 'Status', value: deal.status, inline: true },
      { name: 'Method', value: deal.method, inline: true },
      { name: 'Buyer', value: `<@${deal.buyerId}>`, inline: true },
      { name: 'Seller', value: `<@${deal.sellerId}>`, inline: true },
      { name: 'Amount', value: `${deal.amount} ${deal.currency}`, inline: true },
      { name: 'Product', value: deal.product.slice(0, 1024) }
    )
    .setFooter({ text: `Note: ${deal.uniqueNote}` })
    .setTimestamp(new Date(deal.updatedAt || Date.now()));
}

function paymentStageEmbed(deal, wallet) {
  return new EmbedBuilder()
    .setColor(COLORS.PROGRESS)
    .setTitle('Payment Required')
    .setDescription('Buyer should pay using the exact method and include the unique note where possible.')
    .addFields(
      { name: 'Amount', value: `${deal.amount} ${deal.currency}`, inline: true },
      { name: 'Method', value: deal.method, inline: true },
      { name: 'Receiver Wallet', value: wallet || 'Not configured' },
      { name: 'Unique Note', value: `\`${deal.uniqueNote}\`` },
      { name: 'Instructions', value: 'After payment, click **I Paid** and upload proof in the modal.' }
    )
    .setTimestamp();
}

function disputeEmbed(deal, invite) {
  return new EmbedBuilder()
    .setColor(COLORS.FAIL)
    .setTitle('Deal In Dispute')
    .setDescription(`Deal ${deal.dealId} is frozen. Support team has been requested.`)
    .addFields({ name: 'Support', value: invite });
}

function colorByStatus(status) {
  if (status === 'INITIATED' || status === 'PAYMENT_PENDING') return COLORS.PENDING;
  if (status === 'PAID' || status === 'DELIVERED') return COLORS.PROGRESS;
  if (status === 'COMPLETED') return COLORS.DONE;
  return COLORS.FAIL;
}

module.exports = {
  COLORS,
  dealSummaryEmbed,
  paymentStageEmbed,
  disputeEmbed,
};
