const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setBalance } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setpoints')
    .setDescription('Set a user points balance')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0)),
  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    setBalance(user.id, amount);
    await interaction.reply(`✅ Set ${user} to ${amount} Points.`);
  },
};
