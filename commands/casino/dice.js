const { SlashCommandBuilder } = require('discord.js');
const { ensureBankroll, settleGame, getRoll, TARGET_RTP, rtpAdjusted } = require('../../casino/games');
const { checkAmount, checkCooldown } = require('../../utils/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll dice and win if roll > target')
    .addNumberOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
    .addNumberOption((o) => o.setName('target').setDescription('Target (5-95)').setRequired(true).setMinValue(5).setMaxValue(95)),
  async execute(interaction) {
    const cd = checkCooldown(interaction.user.id, 'dice');
    if (cd) return interaction.reply({ content: `Cooldown: ${cd}s`, ephemeral: true });

    const amount = Math.floor(interaction.options.getNumber('amount', true));
    const target = interaction.options.getNumber('target', true);
    const err = checkAmount(amount);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    if (!ensureBankroll(interaction.user.id, amount)) return interaction.reply({ content: 'Insufficient points.', ephemeral: true });

    const chance = (100 - target) / 100;
    const multiplier = rtpAdjusted(TARGET_RTP / chance);
    const roll = getRoll(interaction.user.id);
    const value = Number((roll.randomFloat * 100).toFixed(2));
    const won = value > target;
    const payout = won ? Math.floor(amount * multiplier) : 0;

    settleGame(interaction.user.id, amount, payout);
    await interaction.reply(
      `🎲 Rolled **${value}** (target > ${target})\n${won ? `✅ Win! Payout: **${payout}**` : '❌ Loss.'}\nMultiplier: **${multiplier.toFixed(4)}x**\nHash: \`${roll.hash}\``,
    );
  },
};
