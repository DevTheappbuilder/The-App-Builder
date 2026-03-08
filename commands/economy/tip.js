const { SlashCommandBuilder } = require('discord.js');
const { changeBalance, getUser } = require('../../database/economy');
const { checkAmount } = require('../../utils/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tip')
    .setDescription('Send points to another user')
    .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
    .addNumberOption((o) => o.setName('amount').setDescription('Amount').setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('user', true);
    const amount = Math.floor(interaction.options.getNumber('amount', true));
    const err = checkAmount(amount);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    if (target.bot || target.id === interaction.user.id) return interaction.reply({ content: 'Invalid target.', ephemeral: true });

    const sender = getUser(interaction.user.id);
    if (sender.balance < amount) return interaction.reply({ content: 'Insufficient balance.', ephemeral: true });

    changeBalance(interaction.user.id, -amount);
    changeBalance(target.id, amount);
    await interaction.reply(`✅ Sent **${amount} Points** to ${target}.`);
  },
};
