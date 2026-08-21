require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb, getDatabaseType } = require('./db/database');
const { runSeed } = require('./db/seed-data');
const { startSchedulers } = require('./schedulers/expiry');
const { isEmailConfigured, isBrevoConfigured, isResendConfigured, isSmtpConfigured, getResendFromAddress, verifyEmailConnection } = require('./services/email');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const organiserRoutes = require('./routes/organiser');
const eventRoutes = require('./routes/events');
const seatRoutes = require('./routes/seats');
const bookingRoutes = require('./routes/bookings');
const waitlistRoutes = require('./routes/waitlist');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const email = await verifyEmailConnection();
  res.json({
    status: 'ok',
    database: getDatabaseType(),
    emailConfigured: isEmailConfigured(),
    emailProvider: email.provider || null,
    emailFrom: email.from || (isResendConfigured() ? getResendFromAddress() : null),
    brevoConfigured: isBrevoConfigured(),
    resendConfigured: isResendConfigured(),
    smtpConfigured: isSmtpConfigured(),
    smtpHost: process.env.SMTP_HOST || null,
    emailVerified: email.ok,
    emailError: email.error || null,
    emailHint: email.hint || null,
    renderSmtpBlockedHint: isSmtpConfigured() && !isBrevoConfigured() && !isResendConfigured()
      ? 'Render free tier blocks SMTP ports 587/465. Use BREVO_API_KEY instead.'
      : null,
    resendHint: isResendConfigured() && !isBrevoConfigured()
      ? 'Resend test mode (onboarding@resend.dev) only delivers to your resend.com signup email. Use Brevo for any recipient.'
      : null,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/organiser', organiserRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/waitlist', waitlistRoutes);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  const db = await initDb();
  await runSeed(db);
  startSchedulers();

  app.listen(PORT, () => {
    console.log(`Ticket Booking API running on http://localhost:${PORT} (${getDatabaseType()})`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
