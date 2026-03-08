const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../../database/db');
const { getUser, changeBalance } = require('../../database/economy');

const DAILY_AMOUNT = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily points reward'),
  async execute(interaction) {
    const user = getUser(interaction.user.id);
    const now = Date.now();
    if (now - user.last_daily < DAY_MS) {
      const next = Math.ceil((DAY_MS - (now - user.last_daily)) / (60 * 60 * 1000));
      await interaction.reply({ content: `You already claimed daily. Try again in ${next}h.`, ephemeral: true });
      return;
    }

    changeBalance(interaction.user.id, DAILY_AMOUNT);
    db.prepare('UPDATE users SET last_daily = ? WHERE user_id = ?').run(now, interaction.user.id);
    await interaction.reply(`✅ You claimed **${DAILY_AMOUNT} Points**.`);
  },
};
