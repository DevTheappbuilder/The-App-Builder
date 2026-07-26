export const ZENITH_EMOJI = '<:__:1484549845955117188>';

export function formatMoney(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function parseAmount(input) {
  if (!input || !/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
  const amount = Number(input);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return null;
  return Math.round(amount * 100) / 100;
}

export function cleanReason(args) {
  if (args.length === 0) return { reason: 'No reason provided.', shouldDm: false };
  const last = args.at(-1)?.toLowerCase();
  const shouldDm = ['y', 'yes'].includes(last);
  const explicitNo = ['n', 'no'].includes(last);
  const reasonArgs = shouldDm || explicitNo ? args.slice(0, -1) : args;
  return { reason: reasonArgs.join(' ').trim() || 'No reason provided.', shouldDm };
}

export function sanitizeChannelName(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80) || 'user';
}

export function unixSeconds(ms = Date.now()) {
  return Math.floor(ms / 1000);
}
