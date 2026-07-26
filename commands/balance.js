import { getUser } from '../utils/database.js';
import { balancePanel } from '../utils/ui.js';
export default { name: 'balance', aliases: ['b', 'bal'], async execute(message) { await message.reply(balancePanel(await getUser(message.author.id))); } };
