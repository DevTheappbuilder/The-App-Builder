const { EmbedBuilder } = require('discord.js');

const COLORS = {
  PENDING: 0xf1c40f,
  ACTIVE: 0x3498db,
  COMPLETE: 0x2ecc71,
  FAIL: 0xe74c3c,
};

function statusColor(status) {
  if (['INITIATED', 'PAYMENT_PENDING'].includes(status)) return COLORS.PENDING;
  if (['PAID', 'DELIVERED'].includes(status)) return COLORS.ACTIVE;
  if (status === 'COMPLETED') return COLORS.COMPLETE;
  return COLORS.FAIL;
}

function repLine(user) {
  const score = Number(user?.ratingScore || 5).toFixed(1);
  const deals = user?.completedDeals || 0;
  return `⭐ ${score} (${deals} deals)`;
}

function buildDealEmbed({ deal, title, instruction, sellerProfile }) {
  return new EmbedBuilder()
    .setColor(statusColor(deal.status))
    .setTitle(title || `Deal ${deal.dealId}`)
    .setDescription(instruction || 'Follow the current stage actions below.')
    .addFields(
      { name: 'Deal ID', value: `\`${deal.dealId}\``, inline: true },
      { name: 'Status', value: deal.status, inline: true },
      { name: 'Stage', value: deal.stage, inline: true },
      { name: 'Buyer', value: `<@${deal.buyerId}>`, inline: true },
      { name: 'Seller', value: `<@${deal.sellerId}>`, inline: true },
      { name: 'Amount', value: `${deal.amount} ${deal.currency}`, inline: true },
      { name: 'Product', value: deal.product.slice(0, 1024) },
      { name: 'Seller Reputation', value: repLine(sellerProfile) },
      { name: 'Unique Note', value: `\`${deal.uniqueNote}\`` }
    )
    .setFooter({ text: `Locked: ${deal.isLocked ? 'Yes' : 'No'} • Expires: ${deal.expiresAt.toISOString()}` })
    .setTimestamp();
}

function buildSupportEmbed(deal) {
  const recentActivity = deal.activityLog
    .slice(-10)
    .map((e) => `• <@${e.actorId}> ${e.action} (${new Date(e.at).toLocaleString('en-US', { timeZone: 'UTC' })} UTC)`)
    .join('\n') || 'No activity';

  return new EmbedBuilder()
    .setColor(COLORS.FAIL)
    .setTitle(`Dispute Opened • ${deal.dealId}`)
    .setDescription('Deal is frozen and requires moderator action.')
    .addFields(
      { name: 'Buyer', value: `<@${deal.buyerId}>`, inline: true },
      { name: 'Seller', value: `<@${deal.sellerId}>`, inline: true },
      { name: 'Amount', value: `${deal.amount} ${deal.currency} (${deal.method})`, inline: true },
      { name: 'Status / Stage', value: `${deal.status} / ${deal.stage}` },
      { name: 'Recent Activity', value: recentActivity.slice(0, 1024) }
    )
    .setTimestamp();
}

module.exports = { COLORS, buildDealEmbed, buildSupportEmbed };
