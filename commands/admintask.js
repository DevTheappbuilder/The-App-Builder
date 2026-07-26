import { adminTaskPanel } from '../utils/ui.js';
export default { name: 'admintask', aliases: [], adminOnly: true, async execute(message) { await message.reply(await adminTaskPanel()); } };
