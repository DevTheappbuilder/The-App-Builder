import boxen from 'boxen';
import Table from 'cli-table3';
import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import config from './config.js';
import { getCurrentTime } from '../utils/formatting.js';
import logger from './logger.js';

const colors = {
  label: chalk.hex('#8b949e'),
  value: chalk.hex('#ffffff'),
  muted: chalk.hex('#6e7681'),
  accent: chalk.hex('#ff4d4d'),
  accentSoft: chalk.hex('#ffa657'),
  online: chalk.hex('#3fb950'),
  offline: chalk.hex('#f85149'),
  warning: chalk.hex('#d29922'),
  border: 'gray'
};

const safeValue = (value, fallback = 'N/A') => {
  if (value === undefined || value === null || value === '') return fallback;
  return value;
};

const metric = (label, value) => `${colors.label(label.padEnd(9))} ${colors.value(safeValue(value))}`;

const percentageFrom = (value) => {
  const numeric = Number.parseFloat(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
};

const bar = (value, width = 18) => {
  const percentage = percentageFrom(value);
  const filled = Math.round((percentage / 100) * width);
  const color = percentage >= 85 ? colors.offline : percentage >= 70 ? colors.warning : colors.online;
  return `${color('█'.repeat(filled))}${colors.muted('░'.repeat(width - filled))} ${colors.value(`${percentage}%`.padStart(4))}`;
};

const makePanel = (title, rows) => boxen(rows.join('\n'), {
  padding: { top: 0, bottom: 0, left: 1, right: 1 },
  borderStyle: 'round',
  borderColor: colors.border,
  title: colors.accent(` ${title} `),
  titleAlignment: 'left'
});

const makeTable = (columns) => {
  const table = new Table({
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  '
    },
    style: { 'padding-left': 0, 'padding-right': 0 },
    colWidths: columns.map(() => Math.floor((config.ui.dashboardWidth - 6) / columns.length))
  });

  table.push(columns);
  return table.toString();
};

export function clearDashboard() {
  process.stdout.write('\u001Bc');
}

export function generateDashboard(client, stats = {}) {
  const isOnline = Boolean(client?.isReady?.());
  const statusText = isOnline ? colors.online('● LIVE') : colors.offline('○ OFFLINE');
  const guildCount = isOnline ? client.guilds?.cache?.size ?? 0 : 0;
  const userCount = isOnline ? client.users?.cache?.size ?? 0 : 0;
  const owner = safeValue(config.bot.owner, 'Unknown owner');

  const rawTitle = figlet.textSync(config.bot.name.toUpperCase(), { font: 'ANSI Shadow' });
  const header = gradient('#ff1f1f', '#ff9d76', '#ffffff').multiline(rawTitle);
  const loadingLine = `${colors.accentSoft('SYSTEM LOADING')} ${colors.muted('•')} ${colors.value('refreshing live telemetry every cycle')}`;

  const networkPanel = makePanel('NETWORK', [
    metric('Status', statusText),
    metric('Latency', safeValue(stats.latency, '0ms')),
    metric('Guilds', guildCount),
    metric('Users', userCount),
    metric('Shard', safeValue(stats.shard, 'single'))
  ]);

  const systemPanel = makePanel('SYSTEM', [
    metric('CPU', safeValue(stats.cpu, '0%')),
    `  ${bar(stats.cpu)}`,
    metric('Memory', safeValue(stats.ram?.system, '0%')),
    `  ${bar(stats.ram?.system)}`,
    metric('Storage', `${safeValue(stats.disk?.free, 'N/A')} free`)
  ]);

  const appPanel = makePanel('APPLICATION', [
    metric('Uptime', safeValue(stats.uptime, 'starting')),
    metric('Version', config.bot.version),
    metric('Node', process.version),
    metric('Discord', safeValue(stats.discordVersion, 'v14.14.1')),
    metric('Owner', owner)
  ]);

  const summary = boxen([
    colors.value.bold(`[ ${config.bot.name.toUpperCase()} ]`),
    loadingLine,
    colors.muted('─'.repeat(Math.max(20, config.ui.dashboardWidth - 8))),
    makeTable([networkPanel, systemPanel, appPanel]),
    `${colors.label('Last Sync:')} ${colors.value(getCurrentTime())}   ${colors.label('Made by:')} ${colors.value(owner)}`
  ].join('\n'), {
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    margin: { bottom: 1 },
    borderStyle: 'round',
    borderColor: colors.border,
    width: config.ui.dashboardWidth
  });

  const logs = logger.getLogs();
  const logOutput = logs.length > 0
    ? logs.map((entry) => `${colors.muted('›')} ${entry}`).join('\n')
    : colors.label('› Waiting for bot actions, commands, warnings, and system events...');

  const logsBox = boxen(logOutput, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: 0,
    borderStyle: 'round',
    borderColor: colors.border,
    width: config.ui.dashboardWidth,
    title: colors.label(' ACTIVITY LOG '),
    titleAlignment: 'center'
  });

  return `\n${header}\n\n${summary}\n${logsBox}`;
}
