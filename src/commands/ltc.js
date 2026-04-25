const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchRates } = require('../utils/price');

const data = new SlashCommandBuilder().setName('ltc').setDescription('Get latest Litecoin price in USD and INR');
if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  try {
    const rates = await fetchRates();
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('Litecoin Price')
      .addFields(
        { name: 'USD', value: `$${rates.ltcUsd}` },
        { name: 'INR', value: `₹${rates.ltcInr}` },
        { name: 'Last Updated', value: new Date(rates.updatedAt).toISOString() }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    return interaction.reply({ content: `Failed to fetch rates: ${error.message}`, ephemeral: true });
  }
}

module.exports = { data, execute };
