const nodemailer = require('nodemailer');

let transporter = null;

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS on the server.');
  }

  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: Number(process.env.SMTP_PORT) !== 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });

  return transporter;
}

async function sendBookingConfirmation({ to, name, bookingRef, eventTitle, eventDate, eventTime, seats, qrBuffer }) {
  const transport = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    const info = await transport.sendMail({
      from,
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

    return {
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) || null,
      sentTo: to,
    };
  } catch (err) {
    if (err.code === 'EAUTH') {
      throw new Error('SMTP login failed. Check SMTP_USER and SMTP_PASS (use a Gmail App Password, not your normal password).');
    }
    throw err;
  }
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

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info) || null,
  };
}

module.exports = { isSmtpConfigured, sendBookingConfirmation, sendWaitlistOffer };
