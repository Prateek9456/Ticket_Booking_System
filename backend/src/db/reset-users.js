require('dotenv').config();
const { initDb } = require('./database');

const db = initDb();

console.log('Clearing all user accounts and related data...');

db.exec('DELETE FROM waitlist');
db.exec('DELETE FROM booking_seats');
db.exec('DELETE FROM bookings');
db.exec('DELETE FROM seat_status');
db.exec('DELETE FROM event_pricing');
db.exec('DELETE FROM events');
db.exec('DELETE FROM email_otps');
db.exec('DELETE FROM users');

console.log('All accounts cleared. Re-seeding demo accounts...');
require('./seed');
