const { SlashCommandBuilder } = require('discord.js');
const { runAction } = require('./_blackjackAction');

module.exports = {
  data: new SlashCommandBuilder().setName('hit').setDescription('Blackjack action: hit'),
  async execute(interaction) {
    await runAction(interaction, 'hit');
  },
};
