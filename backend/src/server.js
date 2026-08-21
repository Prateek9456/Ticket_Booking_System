require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');
const { startSchedulers } = require('./schedulers/expiry');
const { isEmailConfigured, isResendConfigured, isSmtpConfigured, getResendFromAddress, verifyEmailConnection } = require('./services/email');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const organiserRoutes = require('./routes/organiser');
const eventRoutes = require('./routes/events');
const seatRoutes = require('./routes/seats');
const bookingRoutes = require('./routes/bookings');
const waitlistRoutes = require('./routes/waitlist');

initDb();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const email = await verifyEmailConnection();
  res.json({
    status: 'ok',
    emailConfigured: isEmailConfigured(),
    emailProvider: email.provider || null,
    emailFrom: email.from || (isResendConfigured() ? getResendFromAddress() : null),
    resendConfigured: isResendConfigured(),
    smtpConfigured: isSmtpConfigured(),
    smtpHost: process.env.SMTP_HOST || null,
    emailVerified: email.ok,
    emailError: email.error || null,
    renderSmtpBlockedHint: isSmtpConfigured() && !isResendConfigured()
      ? 'Render free tier blocks SMTP ports 587/465. Use RESEND_API_KEY or upgrade Render.'
      : null,
    resendHint: isResendConfigured()
      ? 'With onboarding@resend.dev, emails only deliver to the address you used on resend.com. Register in the app with that same email.'
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

startSchedulers();

app.listen(PORT, () => {
  console.log(`Ticket Booking API running on http://localhost:${PORT}`);
});
