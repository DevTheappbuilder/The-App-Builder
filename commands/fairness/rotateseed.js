const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { rotateServerSeed } = require('../../fairness/provablyFair');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rotateseed')
    .setDescription('Rotate server seed and reveal old one')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const rotated = rotateServerSeed();
    await interaction.reply(
      `♻️ Server seed rotated.\nOld Server Seed: \`${rotated.oldServerSeed}\`\nNew Server Seed Hash: \`${rotated.newServerSeedHash}\``,
    );
  },
};
