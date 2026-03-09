const { SlashCommandBuilder } = require('discord.js');
const { runAction } = require('./_blackjackAction');

module.exports = {
  data: new SlashCommandBuilder().setName('double').setDescription('Blackjack action: double'),
  async execute(interaction) {
    await runAction(interaction, 'double');
  },
};
