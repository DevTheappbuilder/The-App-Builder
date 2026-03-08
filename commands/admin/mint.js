const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { changeBalance } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mint')
    .setDescription('Add points to a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    changeBalance(user.id, amount);
    await interaction.reply(`✅ Minted ${amount} Points for ${user}.`);
  },
};
