require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');

async function bootstrap() {
  config.assertConfig();
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });

  client.commands = new Collection();

  const commandDir = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(commandDir).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandDir, file));
    if (command.data && command.execute) client.commands.set(command.data.name, command);
  }

  const eventDir = path.join(__dirname, 'events');
  for (const file of fs.readdirSync(eventDir).filter((f) => f.endsWith('.js'))) {
    const event = require(path.join(eventDir, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }

  await client.login(config.token);
}

bootstrap().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
