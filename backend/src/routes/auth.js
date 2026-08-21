const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');
const {
  isEmailConfigured,
  sendTestEmail,
  sendPasswordResetOtp,
  sendRegistrationWelcome,
} = require('../services/email');
const {
  normalizeEmail,
  createPasswordResetOtp,
  verifyPasswordResetOtp,
} = require('../services/otp');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  const normalizedEmail = normalizeEmail(email);
  const allowedRoles = ['admin', 'organiser', 'customer'];
  const allowedRole = allowedRoles.includes(role) ? role : 'customer';
  const db = getDb();

  const existing = await db.prepare('SELECT id, role FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({
      error: 'An account with this email already exists. Log in or use forgot password to reset.',
      emailRegistered: true,
    });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = await db.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(normalizedEmail, hash, name.trim(), allowedRole);
    const user = { id: result.lastInsertRowid, email: normalizedEmail, name: name.trim(), role: allowedRole };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    if (isEmailConfigured()) {
      sendRegistrationWelcome({ to: normalizedEmail, name: user.name, role: allowedRole }).catch((err) => {
        console.error('Registration welcome email failed:', err.message);
      });
    }

    res.status(201).json({ user, token });
  } catch {
    res.status(409).json({ error: 'An account with this email already exists. Log in or use forgot password to reset.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = normalizeEmail(email);
  const user = await getDb().prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password', emailRegistered: false });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({
      error: 'Incorrect password',
      emailRegistered: true,
      forgotPassword: true,
    });
  }

  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ user: payload, token });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = normalizeEmail(email);
  const db = getDb();
  const user = await db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(normalizedEmail);

  if (!user) {
    return res.json({
      message: 'If an account exists with this email, a verification code has been sent.',
    });
  }

  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email is not configured on the server.' });
  }

  try {
    const { otp, expiresMinutes } = await createPasswordResetOtp(db, normalizedEmail);
    await sendPasswordResetOtp({
      to: user.email,
      name: user.name,
      otp,
      expiresMinutes,
      role: user.role,
    });
    res.json({
      message: 'If an account exists with this email, a verification code has been sent.',
      emailSent: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, verification code, and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const normalizedEmail = normalizeEmail(email);
  const db = getDb();
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  if (!(await verifyPasswordResetOtp(db, normalizedEmail, otp))) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

  res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await getDb().prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  res.json(user);
});

router.post('/test-email', authenticate, async (req, res) => {
  const user = await getDb().prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email is not configured on the server.' });
  }

  try {
    const info = await sendTestEmail(user.email, user.name);
    res.json({
      message: 'Test email sent',
      sentTo: info.sentTo,
      accepted: info.accepted,
      previewUrl: info.previewUrl || null,
      provider: info.provider || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
