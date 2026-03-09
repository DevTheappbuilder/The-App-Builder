const { SlashCommandBuilder } = require('discord.js');
const { getServerSeedState } = require('../../fairness/provablyFair');
const { getUser } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder().setName('seed').setDescription('Show provably fair seed data'),
  async execute(interaction) {
    const fair = getServerSeedState();
    const user = getUser(interaction.user.id);
    await interaction.reply(
      `🔐 **Provably Fair**\nServer Seed Hash: \`${fair.server_seed_hash}\`\nClient Seed: \`${user.client_seed}\`\nNonce: **${user.nonce}**`,
    );
  },
};
