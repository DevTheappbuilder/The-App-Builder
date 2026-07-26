import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Collection, GatewayIntentBits, ModalBuilder, Partials, TextInputBuilder, TextInputStyle, ContainerBuilder } from 'discord.js';
import { initDatabase, getUser, updateUser, getTasksDb, saveTasksDb, getTicketsDb, saveTicketsDb } from './utils/database.js';
import { canUseCommand, isAdmin, isBlacklisted } from './utils/permissions.js';
import { parseAmount, formatMoney, unixSeconds } from './utils/formatting.js';
import { createTask, parseDuration, removeTask, updateTask, taskStatus, markExpiredTasks } from './utils/tasks.js';
import { adminTaskPanel, balancePanel, notice, taskSelectPanel, tasksPanel, text, sep, v2 } from './utils/ui.js';

const PREFIX = '.';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages], partials: [Partials.Channel] });
client.commands = new Collection();
client.aliases = new Collection();

async function loadCommands() {
  const files = (await readdir(path.join(__dirname, 'commands'))).filter((file) => file.endsWith('.js')).sort();
  const loaded = [];
  for (const file of files) {
    const command = (await import(pathToFileURL(path.join(__dirname, 'commands', file)).href)).default;
    client.commands.set(command.name, command);
    for (const alias of command.aliases || []) client.aliases.set(alias, command.name);
    loaded.push(command.name);
  }
  return loaded;
}

client.once('ready', async () => {
  const loaded = [...client.commands.keys()];
  console.log('════════════════════════════════════════');
  console.log('              ZENITH');
  console.log('════════════════════════════════════════\n');
  loaded.forEach((name) => console.log(`✓ Loaded ${name}`));
  console.log(`\n✓ Logged in as ${client.user.tag}`);
  console.log(`✓ Servers: ${client.guilds.cache.size}`);
  console.log(`✓ Commands: ${client.commands.size}`);
  console.log('\n════════════════════════════════════════');
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
    const [raw, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const name = raw.toLowerCase();
    const command = client.commands.get(name) || client.commands.get(client.aliases.get(name));
    if (!command) return;
    if (!(await canUseCommand(message, command))) return message.reply('❌ You are blacklisted from using Zenith commands.');
    if (command.adminOnly && !isAdmin(message)) return message.reply(notice('❌ Administrator Only', 'You need Administrator permission to use this command.'));
    await command.execute(message, args, client);
  } catch (error) {
    console.error('Command error:', error);
    await message.reply('❌ Something went wrong while running that command.').catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) await handleButton(interaction);
    if (interaction.isStringSelectMenu()) await handleSelect(interaction);
    if (interaction.isModalSubmit()) await handleModal(interaction);
  } catch (error) {
    console.error('Interaction error:', error);
    const payload = notice('❌ Interaction Failed', 'Something went wrong. Please try again.');
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {}); else await interaction.reply(payload).catch(() => {});
  }
});

async function handleButton(interaction) {
  const id = interaction.customId;
  if (!id.startsWith('admintask') && !id.startsWith('task_remove') && !id.startsWith('task_edit') && !id.startsWith('ticket_close') && await isBlacklisted(interaction.user.id)) return interaction.reply(notice('❌ Blacklisted', 'You are blacklisted from using Zenith commands.'));
  if (id.startsWith('admintask') && !isAdmin(interaction)) return interaction.reply(notice('❌ Administrator Only', 'You need Administrator permission.'));
  if (id === 'balance_withdraw') return interaction.reply(notice('💸 Withdrawals', 'Withdrawals are currently unavailable.'));
  if (id === 'balance_tasks') return interaction.reply(await tasksPanel());
  if (id === 'tasks_refresh') return interaction.update(await tasksPanel());
  if (id === 'tasks_dismiss') { try { await interaction.message.delete(); } catch { await interaction.reply(notice('❌ Delete Failed', 'I could not delete this task panel.')); } return; }
  if (id.startsWith('task_claim_')) return claimTask(interaction, id.replace('task_claim_', ''));
  if (id === 'admintask_refresh') return interaction.update(await adminTaskPanel());
  if (id === 'admintask_create') return interaction.showModal(taskModal('task_create_modal', 'Create Zenith Task'));
  if (id === 'admintask_remove') return interaction.reply(await taskSelectPanel('remove'));
  if (id === 'admintask_edit') return interaction.reply(await taskSelectPanel('edit'));
  if (id.startsWith('task_remove_confirm_')) { const taskId = id.replace('task_remove_confirm_', ''); await removeTask(taskId); return interaction.update(notice('✅ Task Removed', `Task \`${taskId}\` has been removed.`)); }
  if (id === 'task_remove_cancel') return interaction.update(notice('✅ Cancelled', 'Task removal was cancelled.'));
  if (id.startsWith('ticket_close_')) return closeTicket(interaction, id.replace('ticket_close_', ''));
}

async function claimTask(interaction, taskId) {
  const db = await markExpiredTasks();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) return interaction.reply(notice('❌ Missing Task', 'That task no longer exists.'));
  if (!taskStatus(task).claimable) return interaction.reply(notice('⏰ Task Unavailable', 'This task has expired.'));
  const user = await getUser(interaction.user.id);
  if (user.claimedTasks.includes(task.id)) return interaction.reply(notice('❌ Already Claimed', 'You have already claimed this task.'));
  await updateUser(interaction.user.id, (u) => { u.pending += task.reward; u.claimedTasks.push(task.id); });
  return interaction.reply(notice('✅ Task Claimed', `🎯 ${task.title}\n\n💰 +${formatMoney(task.reward)} Pending`));
}

async function handleSelect(interaction) {
  if (!isAdmin(interaction)) return interaction.reply(notice('❌ Administrator Only', 'You need Administrator permission.'));
  const taskId = interaction.values[0];
  const db = await getTasksDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) return interaction.reply(notice('❌ Missing Task', 'That task no longer exists.'));
  if (interaction.customId === 'task_remove_select') {
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`task_remove_confirm_${taskId}`).setLabel('Confirm Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('task_remove_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary));
    return interaction.update(v2([new ContainerBuilder().addTextDisplayComponents(text(`## 🗑️ Confirm Remove\n**Task**\n${task.title}\n\n**ID**\n\`${task.id}\``)).addSeparatorComponents(sep()).addActionRowComponents(row)], true));
  }
  if (interaction.customId === 'task_edit_select') return interaction.showModal(taskModal(`task_edit_modal_${taskId}`, 'Edit Zenith Task', task));
}

function taskModal(customId, title, task = {}) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Task Title').setStyle(TextInputStyle.Short).setRequired(true).setValue(task.title || '').setPlaceholder('Send 100 Messages')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reward').setLabel('Reward Amount').setStyle(TextInputStyle.Short).setRequired(true).setValue(task.reward ? String(task.reward) : '').setPlaceholder('500')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Duration').setStyle(TextInputStyle.Short).setRequired(true).setValue(task.duration || '').setPlaceholder('24h'))
  );
}

async function handleModal(interaction) {
  if (!isAdmin(interaction)) return interaction.reply(notice('❌ Administrator Only', 'You need Administrator permission.'));
  const title = interaction.fields.getTextInputValue('title').trim();
  const reward = parseAmount(interaction.fields.getTextInputValue('reward').trim());
  const durationInput = interaction.fields.getTextInputValue('duration').trim();
  const duration = parseDuration(durationInput);
  if (title.length < 3 || title.length > 100) return interaction.reply(notice('❌ Invalid Title', 'Task titles must be 3-100 characters.'));
  if (!reward) return interaction.reply(notice('❌ Invalid Reward', 'Reward must be a positive number with up to two decimals.'));
  if (!duration) return interaction.reply(notice('❌ Invalid Duration', 'Use m, h, d, or w, such as 30m, 2h, 24h, 7d, or 1w.'));
  const task = interaction.customId === 'task_create_modal' ? await createTask({ title, reward, duration: durationInput, createdBy: interaction.user.id }) : await updateTask(interaction.customId.replace('task_edit_modal_', ''), { title, reward, duration: durationInput });
  if (!task) return interaction.reply(notice('❌ Missing Task', 'That task could not be found.'));
  await interaction.reply(notice(interaction.customId === 'task_create_modal' ? '✅ Task Created' : '✏️ Task Updated', `**Task**\n${task.title}\n\n**Reward**\n${formatMoney(task.reward)}\n\n**Duration**\n${duration.label}\n\n**Task ID**\n\`${task.id}\`\n\n**Expiration**\n<t:${unixSeconds(task.expiresAt)}:F>\n\n**Status**\n${taskStatus(task).label}`));
}

async function closeTicket(interaction, ticketId) {
  const db = await getTicketsDb();
  const ticket = db.tickets.find((item) => item.id === ticketId);
  if (!ticket) return interaction.reply(notice('❌ Missing Ticket', 'This ticket is not registered.'));
  if (interaction.user.id !== ticket.userId && !isAdmin(interaction)) return interaction.reply(notice('❌ No Access', 'Only the ticket creator or an administrator can close this ticket.'));
  ticket.status = 'closed'; ticket.closedAt = Date.now(); ticket.closedBy = interaction.user.id; await saveTicketsDb(db);
  await interaction.reply(notice('🔒 Ticket Closed', 'This ticket will be deleted shortly.'));
  setTimeout(() => interaction.channel?.delete('Zenith ticket closed').catch(() => {}), 3000);
}

await initDatabase();
await loadCommands();
setInterval(() => markExpiredTasks().catch((error) => console.error('Task cleanup failed:', error)), 60_000);
if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN === 'YOUR_BOT_TOKEN') {
  console.error('Missing DISCORD_TOKEN in .env. Add your bot token before running Zenith.');
  process.exit(1);
}
await client.login(process.env.DISCORD_TOKEN);
