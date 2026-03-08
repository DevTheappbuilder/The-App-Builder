const { SlashCommandBuilder } = require('discord.js');
const { ensureBankroll, settleGame, getRoll, TARGET_RTP, rtpAdjusted } = require('../../casino/games');
const { checkAmount, checkCooldown } = require('../../utils/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('limbo')
    .setDescription('Limbo crash game')
    .addNumberOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
    .addNumberOption((o) => o.setName('multiplier').setDescription('Target multiplier').setRequired(true).setMinValue(1.01).setMaxValue(1000)),
  async execute(interaction) {
    const cd = checkCooldown(interaction.user.id, 'limbo');
    if (cd) return interaction.reply({ content: `Cooldown: ${cd}s`, ephemeral: true });

    const amount = Math.floor(interaction.options.getNumber('amount', true));
    const target = interaction.options.getNumber('multiplier', true);
    const err = checkAmount(amount);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    if (!ensureBankroll(interaction.user.id, amount)) return interaction.reply({ content: 'Insufficient points.', ephemeral: true });

    const roll = getRoll(interaction.user.id);
    const crash = Math.max(1, Number((TARGET_RTP / (1 - Math.min(0.999999, roll.randomFloat))).toFixed(2)));
    const winChance = Math.min(1, TARGET_RTP / target);
    const adjustedTarget = target / rtpAdjusted(1);
    const won = crash >= adjustedTarget && roll.randomFloat <= winChance;
    const payout = won ? Math.floor(amount * target) : 0;

    settleGame(interaction.user.id, amount, payout);
    await interaction.reply(
      `🚀 Crash: **${crash}x** | Target: **${target}x**\n${won ? `✅ You won **${payout}**` : '❌ You lost.'}\nHash: \`${roll.hash}\``,
    );
  },
};
