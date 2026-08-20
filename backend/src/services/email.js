const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendBookingConfirmation({ to, name, bookingRef, eventTitle, eventDate, eventTime, seats, qrBuffer }) {
  const transport = getTransporter();
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || 'Ticket Booking <noreply@ticketbooking.local>',
    to,
    subject: `Booking Confirmed - ${bookingRef}`,
    html: `
      <h2>Booking Confirmed!</h2>
      <p>Hi ${name},</p>
      <p>Your booking <strong>${bookingRef}</strong> for <strong>${eventTitle}</strong> is confirmed.</p>
      <p><strong>Date:</strong> ${eventDate} at ${eventTime}</p>
      <p><strong>Seats:</strong> ${seats}</p>
      <p>Please present the attached QR code at the venue.</p>
    `,
    attachments: [
      {
        filename: `ticket-${bookingRef}.png`,
        content: qrBuffer,
        contentType: 'image/png',
      },
    ],
  });
  return info;
}

async function sendWaitlistOffer({ to, name, eventTitle, categoryName, offerLink, expiresAt }) {
  const transport = getTransporter();
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || 'Ticket Booking <noreply@ticketbooking.local>',
    to,
    subject: `Seat Available - ${eventTitle}`,
    html: `
      <h2>A seat is available!</h2>
      <p>Hi ${name},</p>
      <p>A <strong>${categoryName}</strong> seat has opened up for <strong>${eventTitle}</strong>.</p>
      <p>Complete your booking before <strong>${expiresAt}</strong>:</p>
      <p><a href="${offerLink}">${offerLink}</a></p>
      <p>If you do not complete booking in time, the seat will be offered to the next person on the waitlist.</p>
    `,
  });
  return info;
}

module.exports = { sendBookingConfirmation, sendWaitlistOffer };
