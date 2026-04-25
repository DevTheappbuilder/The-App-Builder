const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchLtcPrice } = require('../utils/price');

const data = new SlashCommandBuilder().setName('ltc').setDescription('Get latest Litecoin price in USD and INR');
if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  try {
    const prices = await fetchLtcPrice();
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('Litecoin Price (CoinGecko)')
      .addFields(
        { name: 'USD', value: `$${prices.usd}` },
        { name: 'INR', value: `₹${prices.inr}` }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    return interaction.reply({ content: `Failed to fetch LTC price: ${error.message}`, ephemeral: true });
  }
}

module.exports = { data, execute };
