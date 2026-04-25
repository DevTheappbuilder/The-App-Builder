const UPI_REGEX = /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/;
const LTC_REGEX = /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/;
const USDT_REGEX = /^[T0-9A-Za-z]{25,64}$/;

function sanitizeText(input, max = 300) {
  return String(input || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isValidUpi(upi) {
  return !upi || UPI_REGEX.test(upi);
}

function isValidLtc(address) {
  return !address || LTC_REGEX.test(address);
}

function isValidUsdt(address) {
  return !address || USDT_REGEX.test(address);
}

function parseDealButton(customId) {
  const [action, dealId] = customId.split(':');
  if (!action || !dealId) return null;
  return { action, dealId };
}

function assertHttpUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

module.exports = {
  sanitizeText,
  isValidUpi,
  isValidLtc,
  isValidUsdt,
  parseDealButton,
  assertHttpUrl,
};
