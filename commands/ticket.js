import { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from 'discord.js';
import { getTicketsDb, saveTicketsDb } from '../utils/database.js';
import { sanitizeChannelName } from '../utils/formatting.js';
import { notice, text, sep, v2 } from '../utils/ui.js';

export default { name: 'ticket', aliases: [], async execute(message, args) {
  const reason = args.join(' ').trim() || 'No reason provided.';
  const db = await getTicketsDb();
  const duplicate = db.tickets.find((t) => t.userId === message.author.id && t.status === 'open');
  if (duplicate) return message.reply(notice('❌ Ticket Already Open', `You already have an open ticket: <#${duplicate.channelId}>`));
  const parent = process.env.TICKET_CATEGORY_ID && process.env.TICKET_CATEGORY_ID !== 'YOUR_CATEGORY_ID' ? process.env.TICKET_CATEGORY_ID : null;
  const channel = await message.guild.channels.create({
    name: `ticket-${sanitizeChannelName(message.author.username)}`,
    type: ChannelType.GuildText,
    parent,
    topic: `Zenith ticket for ${message.author.id}`,
    permissionOverwrites: [
      { id: message.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: message.author.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: message.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
    ]
  });
  const ticket = { id: channel.id, channelId: channel.id, userId: message.author.id, reason, createdAt: Date.now(), status: 'open' };
  db.tickets.push(ticket); await saveTicketsDb(db);
  await channel.send(v2([new ContainerBuilder().addTextDisplayComponents(text(`## 🎟️ Zenith Support Ticket\n**Creator**\n${message.author}\n\n**Reason**\n${reason}`)).addSeparatorComponents(sep()).addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket_close_${ticket.id}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)))]));
  await message.reply(notice('✅ Ticket Created', `Your private support channel is ready: ${channel}`));
} };
