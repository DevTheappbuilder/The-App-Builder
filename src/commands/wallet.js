const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

const data = new SlashCommandBuilder().setName('wallet').setDescription('View your wallet + reputation profile');
if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

function mask(value) {
  if (!value) return 'Not set';
  if (value.length <= 10) return value;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

async function execute(interaction) {
  const user = await User.findOne({ userId: interaction.user.id }).lean();
  if (!user) return interaction.reply({ content: 'No profile found. Use /setwallet first.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Wallet & Trust Profile')
    .addFields(
      { name: 'UPI', value: mask(user.upiId), inline: false },
      { name: 'LTC', value: mask(user.ltcAddress), inline: false },
      { name: 'USDT', value: mask(user.usdtAddress), inline: false },
      { name: 'Rating', value: `⭐ ${Number(user.ratingScore || 5).toFixed(1)}`, inline: true },
      { name: 'Completed Deals', value: String(user.completedDeals || 0), inline: true },
      { name: 'Disputes', value: String(user.disputes || 0), inline: true }
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data, execute };
