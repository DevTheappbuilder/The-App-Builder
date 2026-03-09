const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { changeBalance, getUser } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Remove points from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const data = getUser(user.id);
    if (data.balance < amount) return interaction.reply({ content: 'User balance too low.', ephemeral: true });
    changeBalance(user.id, -amount);
    await interaction.reply(`✅ Removed ${amount} Points from ${user}.`);
  },
};
