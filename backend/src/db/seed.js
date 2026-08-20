require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDb } = require('./database');

const db = initDb();

const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')"
  ).run('admin@ticketbooking.com', hash, 'System Admin');
  console.log('Seeded admin: admin@ticketbooking.com / admin123');
}

const organiserExists = db.prepare("SELECT id FROM users WHERE email = ?").get('organiser@demo.com');
if (!organiserExists) {
  const hash = bcrypt.hashSync('organiser123', 10);
  db.prepare(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'organiser')"
  ).run('organiser@demo.com', hash, 'Demo Organiser');
  console.log('Seeded organiser: organiser@demo.com / organiser123');
}

const customerExists = db.prepare("SELECT id FROM users WHERE email = ?").get('customer@demo.com');
if (!customerExists) {
  const hash = bcrypt.hashSync('customer123', 10);
  db.prepare(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'customer')"
  ).run('customer@demo.com', hash, 'Demo Customer');
  console.log('Seeded customer: customer@demo.com / customer123');
}

const venueExists = db.prepare('SELECT id FROM venues LIMIT 1').get();
if (!venueExists) {
  const venue = db.prepare('INSERT INTO venues (name, rows, cols) VALUES (?, ?, ?)').run('Grand Cinema Hall', 8, 10);
  const venueId = venue.lastInsertRowid;

  const premium = db.prepare('INSERT INTO seat_categories (venue_id, name, color) VALUES (?, ?, ?)').run(venueId, 'Premium', '#FFD700');
  const standard = db.prepare('INSERT INTO seat_categories (venue_id, name, color) VALUES (?, ?, ?)').run(venueId, 'Standard', '#4CAF50');
  const economy = db.prepare('INSERT INTO seat_categories (venue_id, name, color) VALUES (?, ?, ?)').run(venueId, 'Economy', '#2196F3');

  const insertSeat = db.prepare(
    'INSERT INTO venue_seats (venue_id, row_num, col_num, category_id) VALUES (?, ?, ?, ?)'
  );
  for (let r = 1; r <= 8; r++) {
    for (let c = 1; c <= 10; c++) {
      let catId = economy.lastInsertRowid;
      if (r <= 2) catId = premium.lastInsertRowid;
      else if (r <= 5) catId = standard.lastInsertRowid;
      insertSeat.run(venueId, r, c, catId);
    }
  }
  console.log('Seeded venue: Grand Cinema Hall (8x10)');
}

const eventExists = db.prepare('SELECT id FROM events LIMIT 1').get();
if (!eventExists) {
  const organiser = db.prepare("SELECT id FROM users WHERE email = 'organiser@demo.com'").get();
  const venue = db.prepare('SELECT id FROM venues LIMIT 1').get();
  if (organiser && venue) {
    const event = db.prepare(`
      INSERT INTO events (organiser_id, venue_id, title, type, event_date, event_time, description)
      VALUES (?, ?, 'Summer Music Festival', 'concert', '2026-09-15', '19:30', 'Live outdoor concert with top artists')
    `).run(organiser.id, venue.id);

    const categories = db.prepare('SELECT id, name FROM seat_categories WHERE venue_id = ?').all(venue.id);
    const prices = { Premium: 150, Standard: 80, Economy: 40 };
    const priceStmt = db.prepare('INSERT INTO event_pricing (event_id, category_id, price) VALUES (?, ?, ?)');
    for (const cat of categories) {
      priceStmt.run(event.lastInsertRowid, cat.id, prices[cat.name] || 50);
    }

    const { initEventSeats } = require('../services/seatHold');
    initEventSeats(db, event.lastInsertRowid, venue.id);

    const movie = db.prepare(`
      INSERT INTO events (organiser_id, venue_id, title, type, event_date, event_time, description)
      VALUES (?, ?, 'The Last Horizon', 'movie', '2026-09-20', '20:00', 'Sci-fi blockbuster premiere')
    `).run(organiser.id, venue.id);
    for (const cat of categories) {
      priceStmt.run(movie.lastInsertRowid, cat.id, (prices[cat.name] || 50) * 0.7);
    }
    initEventSeats(db, movie.lastInsertRowid, venue.id);
    console.log('Seeded demo events');
  }
}

console.log('Seed complete.');
