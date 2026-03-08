const { SlashCommandBuilder } = require('discord.js');
const { runAction } = require('./_blackjackAction');

module.exports = {
  data: new SlashCommandBuilder().setName('stand').setDescription('Blackjack action: stand'),
  async execute(interaction) {
    await runAction(interaction, 'stand');
  },
};
