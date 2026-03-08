const { SlashCommandBuilder } = require('discord.js');
const { ensureBankroll, settleGame, getRoll, TARGET_RTP, rtpAdjusted } = require('../../casino/games');
const { checkAmount, checkCooldown } = require('../../utils/guards');
const { animatedResult } = require('../../utils/respond');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cf')
    .setDescription('Coinflip with provably fair RNG')
    .addNumberOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
    .addStringOption((o) =>
      o.setName('side').setDescription('heads or tails').setRequired(true).addChoices({ name: 'heads', value: 'heads' }, { name: 'tails', value: 'tails' }),
    ),
  async execute(interaction) {
    const cd = checkCooldown(interaction.user.id, 'cf');
    if (cd) return interaction.reply({ content: `Cooldown: ${cd}s`, ephemeral: true });
    const amount = Math.floor(interaction.options.getNumber('amount', true));
    const side = interaction.options.getString('side', true);
    const err = checkAmount(amount);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    if (!ensureBankroll(interaction.user.id, amount)) return interaction.reply({ content: 'Insufficient points.', ephemeral: true });

    await interaction.deferReply();
    const roll = getRoll(interaction.user.id);
    const result = roll.randomFloat < 0.5 ? 'heads' : 'tails';
    const won = side === result;
    const payout = won ? Math.floor(amount * rtpAdjusted(2 * TARGET_RTP)) : 0;
    settleGame(interaction.user.id, amount, payout);

    await animatedResult(interaction, '🪙 Hyper Bet Coinflip', [
      'Flipping the coin...',
      `Coin landed on **${result.toUpperCase()}**.`,
      `${won ? `✅ You won **${payout - amount}** profit` : `❌ You lost **${amount}**`}\nHash: \`${roll.hash}\` | Nonce: ${roll.nonceUsed}`,
    ]);
  },
};
