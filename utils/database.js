import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dbDir = path.join(root, 'database');

const defaults = {
  'users.json': {},
  'tasks.json': { tasks: [] },
  'tickets.json': { tickets: [] },
  'blacklist.json': { users: [] }
};

export const dbFiles = Object.fromEntries(Object.keys(defaults).map((name) => [name, path.join(dbDir, name)]));

export function createDefaultUser() {
  return {
    pending: 0,
    withdrawable: 0,
    total: 0,
    claimedTasks: [],
    stats: {
      day: { wagered: 0, profit: 0, bonuses: 0 },
      week: { wagered: 0, profit: 0, bonuses: 0 },
      fortnight: { wagered: 0, profit: 0, bonuses: 0 },
      month: { wagered: 0, profit: 0, bonuses: 0 }
    }
  };
}

export async function initDatabase() {
  await mkdir(dbDir, { recursive: true });
  for (const [name, value] of Object.entries(defaults)) {
    try { await readFile(dbFiles[name], 'utf8'); }
    catch { await writeJson(name, value); }
  }
}

export async function readJson(name) {
  await initDatabase();
  try {
    return JSON.parse(await readFile(dbFiles[name], 'utf8'));
  } catch (error) {
    console.error(`Database read failed for ${name}:`, error.message);
    await writeJson(name, defaults[name]);
    return structuredClone(defaults[name]);
  }
}

export async function writeJson(name, data) {
  await mkdir(dbDir, { recursive: true });
  await writeFile(dbFiles[name], `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function getUsers() { return readJson('users.json'); }
export async function saveUsers(users) { await writeJson('users.json', users); }

export async function getUser(userId) {
  const users = await getUsers();
  if (!users[userId]) users[userId] = createDefaultUser();
  users[userId].pending = Number(users[userId].pending) || 0;
  users[userId].withdrawable = Number(users[userId].withdrawable) || 0;
  users[userId].total = Math.round((users[userId].pending + users[userId].withdrawable) * 100) / 100;
  users[userId].claimedTasks ??= [];
  users[userId].stats ??= createDefaultUser().stats;
  await saveUsers(users);
  return users[userId];
}

export async function updateUser(userId, updater) {
  const users = await getUsers();
  users[userId] ??= createDefaultUser();
  await updater(users[userId]);
  users[userId].total = Math.round((users[userId].pending + users[userId].withdrawable) * 100) / 100;
  await saveUsers(users);
  return users[userId];
}

export async function getTasksDb() { return readJson('tasks.json'); }
export async function saveTasksDb(data) { await writeJson('tasks.json', data); }
export async function getTicketsDb() { return readJson('tickets.json'); }
export async function saveTicketsDb(data) { await writeJson('tickets.json', data); }
export async function getBlacklistDb() { return readJson('blacklist.json'); }
export async function saveBlacklistDb(data) { await writeJson('blacklist.json', data); }
