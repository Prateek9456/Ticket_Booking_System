const nodemailer = require('nodemailer');

let transporter = null;

const RENDER_SMTP_BLOCK_HINT =
  'Render free tier blocks outbound SMTP (ports 587/465). Use Brevo API (BREVO_API_KEY) or Resend instead.';

function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.BREVO_FROM_EMAIL?.trim());
}

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isEmailConfigured() {
  return isBrevoConfigured() || isResendConfigured() || isSmtpConfigured();
}

function getBrevoSender() {
  return {
    email: process.env.BREVO_FROM_EMAIL.trim(),
    name: process.env.BREVO_FROM_NAME?.trim() || 'Ticket Booking',
  };
}

function getResendFromAddress() {
  const resendFrom = process.env.RESEND_FROM?.trim();
  if (resendFrom) return resendFrom;
  return 'Ticket Booking <onboarding@resend.dev>';
}

function getSmtpFromAddress() {
  const user = process.env.SMTP_USER?.trim();
  const from = process.env.SMTP_FROM?.trim();

  if (from && from.includes('<')) return from;
  if (from && from.includes('@')) return `"Ticket Booking" <${from}>`;
  if (user) return `"Ticket Booking" <${user}>`;
  return '"Ticket Booking" <noreply@ticketbooking.local>';
}

function wrapResendError(message, to) {
  const lower = message.toLowerCase();

  if (lower.includes('only send testing emails to your own email')) {
    return new Error(
      `Resend test mode only delivers to the email you signed up with on resend.com (not ${to}). ` +
      'Use Brevo instead (free, no domain): set BREVO_API_KEY and BREVO_FROM_EMAIL in your server env.'
    );
  }

  if (lower.includes('not verified') || lower.includes('domain') || lower.includes('from')) {
    return new Error(
      `Resend rejected the sender address. Set RESEND_FROM to "Ticket Booking <onboarding@resend.dev>" ` +
      `on Render and remove SMTP_FROM. Details: ${message}`
    );
  }

  return new Error(message);
}

function getAuthCredentials() {
  return {
    user: process.env.SMTP_USER.trim(),
    pass: process.env.SMTP_PASS.replace(/\s/g, ''),
  };
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS on the server.');
  }

  if (transporter) return transporter;

  const auth = getAuthCredentials();
  const host = process.env.SMTP_HOST.trim().toLowerCase();

  if (host.includes('gmail.com')) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });
  } else {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth,
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });
  }

  return transporter;
}

function wrapSmtpError(err) {
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENETUNREACH'].includes(err.code)) {
    return new Error(`${err.message}. ${RENDER_SMTP_BLOCK_HINT}`);
  }
  if (err.code === 'EAUTH') {
    return new Error('SMTP login failed. Check SMTP_USER and SMTP_PASS on Render.');
  }
  return err;
}

async function sendViaBrevo({ to, subject, html, attachments = [] }) {
  const sender = getBrevoSender();
  const body = {
    sender,
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  if (attachments.length) {
    body.attachment = attachments.map((attachment) => ({
      name: attachment.filename,
      content: Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : Buffer.from(attachment.content).toString('base64'),
    }));
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY.trim(),
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = result.message || JSON.stringify(result);
    const lower = message.toLowerCase();
    if (lower.includes('sender') || lower.includes('not valid') || lower.includes('verified')) {
      throw new Error(
        `Brevo rejected the sender "${sender.email}". Verify this email in Brevo: ` +
        'Senders & IP → Senders → add your email and click the verification link. ' +
        `Details: ${message}`
      );
    }
    throw new Error(`Brevo API error: ${message}`);
  }

  return {
    messageId: result.messageId || null,
    previewUrl: null,
    sentTo: to,
    accepted: [to],
    provider: 'brevo',
    from: `${sender.name} <${sender.email}>`,
  };
}

async function sendViaResend({ to, subject, html, attachments = [] }) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY.trim());

  const result = await resend.emails.send({
    from: getResendFromAddress(),
    to,
    subject,
    html,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
    })),
  });

  if (result.error) {
    throw wrapResendError(result.error.message, to);
  }

  return {
    messageId: result.data?.id || null,
    previewUrl: null,
    sentTo: to,
    accepted: [to],
    provider: 'resend',
    from: getResendFromAddress(),
  };
}

async function sendViaSmtp({ to, subject, html, attachments = [] }) {
  const transport = getTransporter();

  try {
    const info = await transport.sendMail({
      from: getSmtpFromAddress(),
      to,
      subject,
      html,
      attachments,
    });

    return {
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) || null,
      sentTo: to,
      accepted: info.accepted,
      provider: 'smtp',
    };
  } catch (err) {
    throw wrapSmtpError(err);
  }
}

async function sendEmail(payload) {
  if (isBrevoConfigured()) {
    return sendViaBrevo(payload);
  }
  if (isResendConfigured()) {
    return sendViaResend(payload);
  }
  if (isSmtpConfigured()) {
    return sendViaSmtp(payload);
  }
  throw new Error(
    'Email is not configured. For free delivery to any user (no domain), set BREVO_API_KEY and BREVO_FROM_EMAIL.'
  );
}

async function verifyEmailConnection() {
  if (isBrevoConfigured()) {
    const sender = getBrevoSender();
    return {
      ok: true,
      provider: 'brevo',
      from: `${sender.name} <${sender.email}>`,
      hint: 'Brevo sends to any recipient once your sender email is verified in the Brevo dashboard.',
    };
  }

  if (isResendConfigured()) {
    return {
      ok: true,
      provider: 'resend',
      from: getResendFromAddress(),
    };
  }

  if (!isSmtpConfigured()) {
    return { ok: false, error: 'Email environment variables are missing' };
  }

  try {
    await getTransporter().verify();
    return { ok: true, provider: 'smtp' };
  } catch (err) {
    const wrapped = wrapSmtpError(err);
    return { ok: false, provider: 'smtp', error: wrapped.message };
  }
}

async function sendBookingConfirmation({ to, name, bookingRef, eventTitle, eventDate, eventTime, seats, qrBuffer }) {
  return sendEmail({
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
}

async function sendTestEmail(to, name) {
  return sendEmail({
    to,
    subject: 'Ticket Booking System - Test Email',
    html: `<p>Hi ${name},</p><p>If you received this, email delivery is working correctly.</p>`,
  });
}

async function sendWaitlistOffer({ to, name, eventTitle, categoryName, offerLink, expiresAt }) {
  return sendEmail({
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
}

async function sendPasswordResetOtp({ to, name, otp, expiresMinutes, role }) {
  const roleLabel = role === 'admin' ? 'Admin' : role === 'organiser' ? 'Organiser' : 'Customer';
  return sendEmail({
    to,
    subject: 'Password Reset Verification Code',
    html: `
      <h2>Reset Your Password</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset the password for your <strong>${roleLabel}</strong> account.</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #4f46e5;">${otp}</p>
      <p>This code expires in <strong>${expiresMinutes} minutes</strong>.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}

async function sendBookingCancellation({ to, name, bookingRef, eventTitle, eventDate, eventTime, seats, totalAmount }) {
  return sendEmail({
    to,
    subject: `Booking Cancelled - ${bookingRef}`,
    html: `
      <h2>Booking Cancelled</h2>
      <p>Hi ${name},</p>
      <p>Your booking <strong>${bookingRef}</strong> for <strong>${eventTitle}</strong> has been cancelled.</p>
      <p><strong>Date:</strong> ${eventDate} at ${eventTime}</p>
      <p><strong>Seats:</strong> ${seats}</p>
      <p><strong>Refund amount:</strong> $${Number(totalAmount).toFixed(2)}</p>
      <p>If you did not request this cancellation, please contact support immediately.</p>
    `,
  });
}

function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'organiser') return 'Organiser';
  return 'Customer';
}

async function sendRegistrationWelcome({ to, name, role }) {
  const label = roleLabel(role);
  return sendEmail({
    to,
    subject: `Welcome to Ticket Booking - ${label} Account`,
    html: `
      <h2>Welcome, ${name}!</h2>
      <p>Your <strong>${label}</strong> account has been created successfully.</p>
      <p>You can now log in with this email address to ${role === 'organiser' ? 'create and manage events' : role === 'admin' ? 'manage venues' : 'browse events and book tickets'}.</p>
      <p>If you did not create this account, please contact support immediately.</p>
    `,
  });
}

async function sendEventCreated({ to, name, title, type, venueName, eventDate, eventTime }) {
  return sendEmail({
    to,
    subject: `Event Created - ${title}`,
    html: `
      <h2>Event Created</h2>
      <p>Hi ${name},</p>
      <p>Your event <strong>${title}</strong> (${type}) has been created at <strong>${venueName}</strong>.</p>
      <p><strong>Date:</strong> ${eventDate} at ${eventTime}</p>
      <p>Customers can now discover and book tickets for this event.</p>
    `,
  });
}

async function sendEventCancelled({ to, name, title, venueName, eventDate, eventTime }) {
  return sendEmail({
    to,
    subject: `Event Cancelled - ${title}`,
    html: `
      <h2>Event Cancelled</h2>
      <p>Hi ${name},</p>
      <p>Your event <strong>${title}</strong> at <strong>${venueName}</strong> has been removed.</p>
      <p><strong>Was scheduled for:</strong> ${eventDate} at ${eventTime}</p>
      <p>If you did not request this, please contact support immediately.</p>
    `,
  });
}

async function sendVenueCreated({ to, name, venueName, rows, cols, categories }) {
  const categoryList = categories.map((c) => c.name).join(', ');
  return sendEmail({
    to,
    subject: `Venue Created - ${venueName}`,
    html: `
      <h2>Venue Created</h2>
      <p>Hi ${name},</p>
      <p>Venue <strong>${venueName}</strong> has been created successfully.</p>
      <p><strong>Layout:</strong> ${rows} rows &times; ${cols} columns</p>
      <p><strong>Categories:</strong> ${categoryList}</p>
      <p>Organisers can now use this venue when creating events.</p>
    `,
  });
}

async function sendVenueCancelled({ to, name, venueName, rows, cols }) {
  return sendEmail({
    to,
    subject: `Venue Removed - ${venueName}`,
    html: `
      <h2>Venue Removed</h2>
      <p>Hi ${name},</p>
      <p>Venue <strong>${venueName}</strong> (${rows} rows &times; ${cols} columns) has been removed from the system.</p>
      <p>If you did not request this, please contact support immediately.</p>
    `,
  });
}

module.exports = {
  isBrevoConfigured,
  isResendConfigured,
  isSmtpConfigured,
  isEmailConfigured,
  getResendFromAddress,
  getBrevoSender,
  verifyEmailConnection,
  verifySmtpConnection: verifyEmailConnection,
  sendBookingConfirmation,
  sendBookingCancellation,
  sendPasswordResetOtp,
  sendRegistrationWelcome,
  sendEventCreated,
  sendEventCancelled,
  sendVenueCreated,
  sendVenueCancelled,
  sendTestEmail,
  sendWaitlistOffer,
};
