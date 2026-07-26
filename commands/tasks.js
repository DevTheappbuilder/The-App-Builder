import { tasksPanel } from '../utils/ui.js';
export default { name: 'tasks', aliases: ['task'], async execute(message) { await message.reply(await tasksPanel()); } };
