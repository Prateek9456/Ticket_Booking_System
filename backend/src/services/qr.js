const QRCode = require('qrcode');

async function generateBookingQR(bookingRef) {
  return QRCode.toBuffer(bookingRef, { type: 'png', width: 300, margin: 2 });
}

module.exports = { generateBookingQR };
