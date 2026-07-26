import { updateUser } from '../utils/database.js';
import { parseAmount, formatMoney } from '../utils/formatting.js';
import { notice } from '../utils/ui.js';
export default { name: 'mint', aliases: [], adminOnly: true, async execute(message, args, client) { const amount = parseAmount(args[0]); if (!amount) return message.reply(notice('❌ Invalid Amount', 'Enter a positive number with up to two decimals.')); const user = await updateUser(client.user.id, (u) => { u.withdrawable += amount; }); await message.reply(notice('✅ Bot Account Minted', `**Amount**\n${formatMoney(amount)}\n\n**Bot Withdrawable**\n${formatMoney(user.withdrawable)}\n\n**Bot Total**\n${formatMoney(user.total)}`)); } };
