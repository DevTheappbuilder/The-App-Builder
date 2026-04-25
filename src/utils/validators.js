const UPI_REGEX = /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/;
const LTC_REGEX = /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/;
const USDT_REGEX = /^[T0-9A-Za-z]{25,64}$/;

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

module.exports = {
  isValidUpi,
  isValidLtc,
  isValidUsdt,
  parseDealButton,
};
