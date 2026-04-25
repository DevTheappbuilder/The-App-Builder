const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getStats } = require('../services/dealService');

const data = new SlashCommandBuilder().setName('stats').setDescription('Marketplace analytics summary');

async function execute(interaction) {
  const stats = await getStats();
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Marketplace Analytics')
    .addFields(
      { name: 'Total Deals', value: String(stats.total), inline: true },
      { name: 'Completed', value: String(stats.completed), inline: true },
      { name: 'Cancelled', value: String(stats.cancelled), inline: true },
      { name: 'Disputes', value: String(stats.disputes), inline: true },
      { name: 'Success Rate', value: `${stats.successRate}%`, inline: true },
      { name: 'Top Method', value: stats.topMethod, inline: true }
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data, execute };
