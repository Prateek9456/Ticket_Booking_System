const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const OTP_EXPIRY_MINUTES = 15;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

async function createPasswordResetOtp(db, email) {
  const normalized = normalizeEmail(email);
  const otp = generateOtp();
  const otpHash = bcrypt.hashSync(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await db.prepare(`
    UPDATE email_otps SET used_at = datetime('now')
    WHERE email = ? AND purpose = 'password_reset' AND used_at IS NULL
  `).run(normalized);

  await db.prepare(`
    INSERT INTO email_otps (email, otp_hash, purpose, expires_at) VALUES (?, ?, 'password_reset', ?)
  `).run(normalized, otpHash, expiresAt);

  return { otp, expiresAt, expiresMinutes: OTP_EXPIRY_MINUTES };
}

async function verifyPasswordResetOtp(db, email, otp) {
  const normalized = normalizeEmail(email);
  const row = await db.prepare(`
    SELECT * FROM email_otps
    WHERE email = ? AND purpose = 'password_reset' AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(normalized);

  if (!row) return false;
  if (new Date(row.expires_at) < new Date()) return false;
  if (!bcrypt.compareSync(String(otp), row.otp_hash)) return false;

  await db.prepare("UPDATE email_otps SET used_at = datetime('now') WHERE id = ?").run(row.id);
  return true;
}

module.exports = {
  normalizeEmail,
  createPasswordResetOtp,
  verifyPasswordResetOtp,
  OTP_EXPIRY_MINUTES,
};
