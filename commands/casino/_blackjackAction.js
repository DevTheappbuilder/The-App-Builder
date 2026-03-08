const { action, settle, getState, handValue, canSplit } = require('../../casino/blackjack');
const { ensureBankroll, settleGame } = require('../../casino/games');

function render(state, revealDealer = false) {
  const dealerText = revealDealer
    ? `Dealer: [${state.dealer.join(', ')}] = ${handValue(state.dealer).total}`
    : `Dealer: [${state.dealer[0]}, ?]`;
  const hands = state.hands
    .map((h, i) => `${i === state.activeHand && !state.finished ? '👉 ' : ''}Hand ${i + 1}: [${h.cards.join(', ')}] = ${handValue(h.cards).total} (${h.wager})${h.done ? ' ✅' : ''}`)
    .join('\n');
  return `${dealerText}\n${hands}`;
}

async function runAction(interaction, type) {
  const state = getState(interaction.user.id);
  if (!state) return interaction.reply({ content: 'No active blackjack game.', ephemeral: true });

  const hand = state.hands[state.activeHand];
  if ((type === 'double' || type === 'split') && hand) {
    const extra = hand.wager;
    if (!ensureBankroll(interaction.user.id, extra)) return interaction.reply({ content: 'Not enough points for that action.', ephemeral: true });
  }

  if (type === 'split' && hand && !canSplit(hand)) return interaction.reply({ content: 'Current hand cannot be split.', ephemeral: true });

  const result = action(interaction.user.id, type);
  if (result.error) return interaction.reply({ content: result.error, ephemeral: true });

  if (!result.state.finished) {
    await interaction.reply(`🃏 Action: **${type}**\n${render(result.state)}`);
    return;
  }

  const done = settle(interaction.user.id);
  settleGame(interaction.user.id, done.totalWager, done.payout);
  await interaction.reply(
    `🃏 Blackjack finished.\n${render(done.state, true)}\nOutcomes: ${done.outcomes.join(', ')}\nPayout: **${Math.floor(done.payout)}**`,
  );
}

module.exports = { runAction };
