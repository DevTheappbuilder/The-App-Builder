const { SlashCommandBuilder } = require('discord.js');
const { runAction } = require('./_blackjackAction');

module.exports = {
  data: new SlashCommandBuilder().setName('split').setDescription('Blackjack action: split'),
  async execute(interaction) {
    await runAction(interaction, 'split');
  },
};
