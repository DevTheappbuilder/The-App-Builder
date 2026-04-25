const QRCode = require('qrcode');

async function generateQrDataUrl(value) {
  if (!value) return null;
  return QRCode.toDataURL(value, { margin: 1, width: 300 });
}

module.exports = { generateQrDataUrl };
