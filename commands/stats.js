import { getUser } from '../utils/database.js';
import { statsPanel } from '../utils/ui.js';
export default { name: 'stats', aliases: [], async execute(message) { await message.reply(statsPanel(await getUser(message.author.id))); } };
