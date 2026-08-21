require('dotenv').config();
const { initDb } = require('./database');

async function resetUsers() {
  const db = await initDb();

  console.log('Clearing all user accounts and related data...');

  await db.exec('DELETE FROM waitlist');
  await db.exec('DELETE FROM booking_seats');
  await db.exec('DELETE FROM bookings');
  await db.exec('DELETE FROM seat_status');
  await db.exec('DELETE FROM event_pricing');
  await db.exec('DELETE FROM events');
  await db.exec('DELETE FROM email_otps');
  await db.exec('DELETE FROM users');

  console.log('All accounts cleared. Re-seeding admin account...');
  require('./seed');
}

resetUsers().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
