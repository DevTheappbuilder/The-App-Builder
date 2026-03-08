require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, ActivityType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

function resolveCommandsDir() {
  const candidates = [
    process.env.COMMANDS_DIR,
    path.join(__dirname, 'commands'),
    path.join(process.cwd(), 'commands'),
  ].filter(Boolean);

  const found = candidates.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  if (!found) {
    console.error(
      `Commands directory not found. Checked: ${candidates.join(', ')}. Set COMMANDS_DIR to the absolute commands path.`,
    );
    return null;
  }

  return found;
}

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

function looksLikeDiscordToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.includes('your_') || token.includes('token_here') || token.includes('example')) return false;
  return token.split('.').length === 3;
}

const commandsDir = resolveCommandsDir();
if (commandsDir) loadCommands(commandsDir);

client.once('ready', () => {
  client.user.setActivity('🎰 Hyper Bet | Casino', { type: ActivityType.Playing });
  console.log(`Logged in as ${client.user.tag} with ${client.commands.size} commands loaded.`);
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

const token = process.env.DISCORD_TOKEN;
if (!looksLikeDiscordToken(token)) {
  console.error('DISCORD_TOKEN is missing or invalid. Set a valid bot token in your environment variables.');
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error('Failed to login to Discord. Verify DISCORD_TOKEN and bot intents.', err);
  process.exit(1);
});
