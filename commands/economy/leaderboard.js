const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('View richest players'),
  async execute(interaction) {
    const rows = db.prepare('SELECT user_id, balance FROM users ORDER BY balance DESC LIMIT 10').all();
    if (!rows.length) {
      await interaction.reply('No players yet.');
      return;
    }
    const lines = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${Math.floor(r.balance)} Points`).join('\n');
    await interaction.reply({ content: `🏆 **Leaderboard**\n${lines}` });
  },
};
