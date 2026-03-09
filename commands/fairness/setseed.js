const { SlashCommandBuilder } = require('discord.js');
const { setClientSeed } = require('../../fairness/provablyFair');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setseed')
    .setDescription('Set your client seed')
    .addStringOption((o) => o.setName('seed').setDescription('Client seed').setRequired(true).setMaxLength(64)),
  async execute(interaction) {
    const seed = interaction.options.getString('seed', true);
    setClientSeed(interaction.user.id, seed);
    await interaction.reply(`✅ Client seed updated to \`${seed}\` and nonce reset.`);
  },
};
