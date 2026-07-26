import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { formatMoney, unixSeconds, ZENITH_EMOJI } from './formatting.js';
import { markExpiredTasks, taskStatus } from './tasks.js';

export function v2(components, ephemeral = false) {
  return { components, flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2 };
}
export const text = (content) => new TextDisplayBuilder().setContent(content);
export const sep = () => new SeparatorBuilder();

export function notice(title, body, ephemeral = false) {
  return v2([new ContainerBuilder().addTextDisplayComponents(text(`## ${title}\n${body}`))], ephemeral);
}

export function balancePanel(user) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('balance_withdraw').setLabel('Withdraw').setEmoji('💸').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('balance_tasks').setLabel('Tasks').setEmoji('📋').setStyle(ButtonStyle.Primary)
  );
  return v2([new ContainerBuilder()
    .addTextDisplayComponents(text(`## 💰 YOUR BALANCE\nZenith account overview`)).addSeparatorComponents(sep())
    .addTextDisplayComponents(text(`${ZENITH_EMOJI} **Pending**\n# ${formatMoney(user.pending)}`)).addSeparatorComponents(sep())
    .addTextDisplayComponents(text(`${ZENITH_EMOJI} **Withdrawable**\n# ${formatMoney(user.withdrawable)}`)).addSeparatorComponents(sep())
    .addTextDisplayComponents(text(`${ZENITH_EMOJI} **Total**\n# ${formatMoney(user.total)}`))
    .addActionRowComponents(row)]);
}

export async function tasksPanel() {
  const db = await markExpiredTasks();
  const active = db.tasks.filter((task) => taskStatus(task).claimable);
  const container = new ContainerBuilder().addTextDisplayComponents(text('## 📋 Active Tasks'));
  if (active.length === 0) container.addSeparatorComponents(sep()).addTextDisplayComponents(text('### No Active Tasks\nThere are currently no tasks available.\nCheck back later for new tasks.'));
  for (const task of active.slice(0, 5)) {
    container.addSeparatorComponents(sep()).addTextDisplayComponents(text(`### 🎯 ${task.title}\n**Reward** ${formatMoney(task.reward)}\n**Duration** ${task.duration}\n**Expires** <t:${unixSeconds(task.expiresAt)}:R>`))
      .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`task_claim_${task.id}`).setLabel('Claim').setEmoji('🎁').setStyle(ButtonStyle.Success)));
  }
  container.addSeparatorComponents(sep()).addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tasks_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tasks_dismiss').setLabel('Dismiss').setEmoji('✖️').setStyle(ButtonStyle.Danger)
  ));
  return v2([container]);
}

export function statsPanel(user) {
  const s = user.stats;
  const section = (title, data) => `### ${title}\nWagered: ${formatMoney(data.wagered)}\nProfit: ${formatMoney(data.profit)}\nBonuses: ${formatMoney(data.bonuses)}`;
  return v2([new ContainerBuilder().addTextDisplayComponents(text(`## 📊 Statistics\n${section('Today', s.day)}`)).addSeparatorComponents(sep()).addTextDisplayComponents(text(section('This Week', s.week))).addSeparatorComponents(sep()).addTextDisplayComponents(text(section('Fortnight', s.fortnight))).addSeparatorComponents(sep()).addTextDisplayComponents(text(section('This Month', s.month)))]);
}

export async function adminTaskPanel() {
  const db = await markExpiredTasks();
  const active = db.tasks.filter((task) => taskStatus(task).claimable).length;
  return v2([new ContainerBuilder()
    .addTextDisplayComponents(text(`## 🛠️ ZENITH TASK CENTER\nManage the tasks currently in circulation.\n\n**Active Tasks:** ${active}\n**Total Tasks:** ${db.tasks.length}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admintask_create').setLabel('Create Task').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('admintask_remove').setLabel('Remove Task').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('admintask_edit').setLabel('Edit Task').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admintask_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
    ))]);
}

export async function taskSelectPanel(kind) {
  const db = await markExpiredTasks();
  const tasks = db.tasks.filter((task) => kind === 'remove' ? taskStatus(task).claimable : true).slice(0, 25);
  if (!tasks.length) return notice('❌ No Tasks', 'There are no tasks available for that action.');
  const menu = new StringSelectMenuBuilder().setCustomId(kind === 'remove' ? 'task_remove_select' : 'task_edit_select').setPlaceholder(`Select a task to ${kind}...`).addOptions(tasks.map((task) => ({ label: task.title.slice(0, 100), value: task.id, description: `${taskStatus(task).label} • ${formatMoney(task.reward)} • ${task.duration}`.slice(0, 100) })));
  return v2([new ContainerBuilder().addTextDisplayComponents(text(`## ${kind === 'remove' ? '🗑️ Remove Task' : '✏️ Edit Task'}\nChoose a task from the menu below.`)).addSeparatorComponents(sep()).addActionRowComponents(new ActionRowBuilder().addComponents(menu))], true);
}
