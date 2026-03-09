const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder().setName('balance').setDescription('Show your points balance'),
  async execute(interaction) {
    const user = getUser(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle('💰 Balance')
      .setDescription(`You have **${Math.floor(user.balance)} Points**.`);
    await interaction.reply({ embeds: [embed] });
  },
};
