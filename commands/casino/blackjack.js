const { SlashCommandBuilder } = require('discord.js');
const { startGame, handValue } = require('../../casino/blackjack');
const { ensureBankroll } = require('../../casino/games');
const { checkAmount, checkCooldown } = require('../../utils/guards');

function render(state) {
  const hands = state.hands
    .map((h, i) => `${i === state.activeHand && !state.finished ? '👉 ' : ''}Hand ${i + 1}: [${h.cards.join(', ')}] = ${handValue(h.cards).total} (${h.wager})${h.done ? ' ✅' : ''}`)
    .join('\n');
  return `Dealer: [${state.dealer[0]}, ?]\n${hands}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Start a blackjack game')
    .addIntegerOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(1)),
  async execute(interaction) {
    const cd = checkCooldown(interaction.user.id, 'blackjack', 1000);
    if (cd) return interaction.reply({ content: `Cooldown: ${cd}s`, ephemeral: true });

    const amount = interaction.options.getInteger('amount', true);
    const err = checkAmount(amount);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    if (!ensureBankroll(interaction.user.id, amount)) return interaction.reply({ content: 'Insufficient points.', ephemeral: true });

    const state = startGame(interaction.user.id, amount);
    await interaction.reply(`🃏 Blackjack started.\n${render(state)}\nUse /hit /stand /double /split`);
  },
};
