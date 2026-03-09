const { EmbedBuilder } = require('discord.js');

async function animatedResult(interaction, title, steps, color = 0x2b2d31) {
  const embed = new EmbedBuilder().setTitle(title).setColor(color).setDescription(steps[0]);
  await interaction.editReply({ embeds: [embed] });
  for (let i = 1; i < steps.length; i += 1) {
    await new Promise((r) => setTimeout(r, 400));
    embed.setDescription(steps[i]);
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { animatedResult };
