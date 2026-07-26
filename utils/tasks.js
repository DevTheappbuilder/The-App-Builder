import crypto from 'node:crypto';
import { getTasksDb, saveTasksDb } from './database.js';

const units = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const labels = { m: 'minutes', h: 'hours', d: 'days', w: 'weeks' };

export function parseDuration(input) {
  const match = String(input || '').trim().toLowerCase().match(/^(\d{1,4})([mhdw])$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return { value: `${amount}${match[2]}`, ms: amount * units[match[2]], label: `${amount} ${labels[match[2]].replace(/s$/, amount === 1 ? '' : 's')}` };
}

export function taskStatus(task, now = Date.now()) {
  if (!task.active) return { label: '⏸️ Disabled', claimable: false };
  if (Number(task.expiresAt) <= now) return { label: '🔴 Expired', claimable: false };
  return { label: '🟢 Active', claimable: true };
}

export async function markExpiredTasks() {
  const db = await getTasksDb();
  let changed = false;
  for (const task of db.tasks) {
    if (task.active && Number(task.expiresAt) <= Date.now()) { task.active = false; changed = true; }
  }
  if (changed) await saveTasksDb(db);
  return db;
}

export async function createTask({ title, reward, duration, createdBy }) {
  const parsed = parseDuration(duration);
  if (!parsed) throw new Error('Invalid duration. Use 30m, 2h, 24h, 7d, or 1w.');
  const db = await getTasksDb();
  let id;
  do { id = crypto.randomBytes(4).toString('hex'); } while (db.tasks.some((task) => task.id === id));
  const now = Date.now();
  const task = { id, title: title.trim(), reward, duration: parsed.value, expiresAt: now + parsed.ms, active: true, createdBy, createdAt: now };
  db.tasks.push(task);
  await saveTasksDb(db);
  return task;
}

export async function updateTask(id, values) {
  const db = await getTasksDb();
  const task = db.tasks.find((item) => item.id === id);
  if (!task) return null;
  task.title = values.title.trim();
  task.reward = values.reward;
  const parsed = parseDuration(values.duration);
  task.duration = parsed.value;
  task.expiresAt = Date.now() + parsed.ms;
  task.active = true;
  await saveTasksDb(db);
  return task;
}

export async function removeTask(id) {
  const db = await getTasksDb();
  const before = db.tasks.length;
  db.tasks = db.tasks.filter((task) => task.id !== id);
  await saveTasksDb(db);
  return before !== db.tasks.length;
}
