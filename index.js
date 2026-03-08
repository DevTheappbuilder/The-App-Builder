require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, ActivityType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

function loadCommands(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, file.name);
    if (file.isDirectory()) loadCommands(full);
    if (file.isFile() && file.name.endsWith('.js') && !file.name.startsWith('_')) {
      const command = require(full);
      if (command?.data?.name) client.commands.set(command.data.name, command);
    }
  }
}

loadCommands(path.join(__dirname, 'commands'));

client.once('ready', () => {
  client.user.setActivity('🎰 Hyper Bet | Casino', { type: ActivityType.Playing });
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'An error occurred while executing that command.' });
    } else {
      await interaction.reply({ content: 'An error occurred while executing that command.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
