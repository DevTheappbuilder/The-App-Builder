const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

const data = new SlashCommandBuilder().setName('wallet').setDescription('View your configured wallet details');
if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  const user = await User.findOne({ userId: interaction.user.id });
  if (!user) return interaction.reply({ content: 'No wallet info found. Use /setwallet first.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Your Wallet Details')
    .addFields(
      { name: 'UPI', value: user.upiId || 'Not set' },
      { name: 'LTC', value: user.ltcAddress || 'Not set' },
      { name: 'USDT', value: user.usdtAddress || 'Not set' }
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data, execute };
