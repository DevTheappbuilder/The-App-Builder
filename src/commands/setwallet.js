const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');
const { isValidUpi, isValidLtc, isValidUsdt } = require('../utils/validators');

const data = new SlashCommandBuilder()
  .setName('setwallet')
  .setDescription('Set or update your payout wallet addresses')
  .addStringOption((o) => o.setName('upi').setDescription('UPI ID').setRequired(false))
  .addStringOption((o) => o.setName('ltc').setDescription('Litecoin address').setRequired(false))
  .addStringOption((o) => o.setName('usdt').setDescription('USDT address').setRequired(false));

if (typeof data.setContexts === 'function') data.setContexts(0, 1, 2);
if (typeof data.setIntegrationTypes === 'function') data.setIntegrationTypes(0, 1);

async function execute(interaction) {
  const upi = interaction.options.getString('upi');
  const ltc = interaction.options.getString('ltc');
  const usdt = interaction.options.getString('usdt');

  if (!isValidUpi(upi) || !isValidLtc(ltc) || !isValidUsdt(usdt)) {
    return interaction.reply({ content: 'Invalid wallet format provided.', ephemeral: true });
  }

  const update = {};
  if (upi !== null) update.upiId = upi;
  if (ltc !== null) update.ltcAddress = ltc;
  if (usdt !== null) update.usdtAddress = usdt;

  await User.updateOne({ userId: interaction.user.id }, { $set: update }, { upsert: true });
  return interaction.reply({ content: 'Wallet details saved successfully.', ephemeral: true });
}

module.exports = { data, execute };
