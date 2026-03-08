const { SlashCommandBuilder } = require('discord.js');
const { getUser, getHouse } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder().setName('stats').setDescription('Show your gambling stats'),
  async execute(interaction) {
    const user = getUser(interaction.user.id);
    const house = getHouse();
    const userRtp = user.total_wagered ? ((user.total_won / user.total_wagered) * 100).toFixed(2) : '0.00';
    const globalRtp = house.total_wagered ? ((house.total_paid / house.total_wagered) * 100).toFixed(2) : '0.00';

    await interaction.reply(
      `📊 **Stats for ${interaction.user.username}**\nWins: **${user.wins}** | Losses: **${user.losses}**\nTotal Wagered: **${user.total_wagered.toFixed(2)}**\nTotal Won: **${user.total_won.toFixed(2)}**\nYour RTP: **${userRtp}%**\nGlobal RTP: **${globalRtp}%**\nJackpot Pool: **${house.jackpot.toFixed(2)} Points**`,
    );
  },
};
