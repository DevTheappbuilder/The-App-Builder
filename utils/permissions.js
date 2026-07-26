import { PermissionFlagsBits } from 'discord.js';
import { getBlacklistDb } from './database.js';

export function isAdmin(messageOrInteraction) {
  return Boolean(messageOrInteraction.member?.permissions?.has(PermissionFlagsBits.Administrator));
}

export async function isBlacklisted(userId) {
  const db = await getBlacklistDb();
  return db.users.includes(userId);
}

export async function canUseCommand(message, command) {
  if (command?.adminOnly) return isAdmin(message);
  if (await isBlacklisted(message.author.id)) return false;
  return true;
}
