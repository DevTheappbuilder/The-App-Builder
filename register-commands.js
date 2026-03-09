require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];

function resolveCommandsDir() {
  const candidates = [
    process.env.COMMANDS_DIR,
    path.join(__dirname, 'commands'),
    path.join(process.cwd(), 'commands'),
  ].filter(Boolean);

  const found = candidates.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  if (!found) {
    throw new Error(
      `Commands directory not found. Checked: ${candidates.join(', ')}. Set COMMANDS_DIR to the absolute commands path.`,
    );
  }

  return found;
}

function loadCommands(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, file.name);
    if (file.isDirectory()) loadCommands(full);
    if (file.isFile() && file.name.endsWith('.js') && !file.name.startsWith('_')) {
      const command = require(full);
      if (command?.data?.toJSON) commands.push(command.data.toJSON());
    }
  }
}

function assertEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const commandsDir = resolveCommandsDir();
loadCommands(commandsDir);

const token = assertEnv('DISCORD_TOKEN');
const clientId = assertEnv('CLIENT_ID');
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`Registered ${commands.length} slash commands.`);
})();
