require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDb } = require('./database');

async function seed() {
  const db = await initDb();

  const adminExists = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.prepare(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')"
    ).run('admin@ticketbooking.com', hash, 'System Admin');
    console.log('Seeded admin: admin@ticketbooking.com / admin123');
  }

  const venueExists = await db.prepare('SELECT id FROM venues LIMIT 1').get();
  if (!venueExists) {
    const venue = await db.prepare('INSERT INTO venues (name, rows, cols) VALUES (?, ?, ?)').run('Grand Cinema Hall', 8, 10);
    const venueId = venue.lastInsertRowid;

    const premium = await db.prepare('INSERT INTO seat_categories (venue_id, name, color) VALUES (?, ?, ?)').run(venueId, 'Premium', '#FFD700');
    const standard = await db.prepare('INSERT INTO seat_categories (venue_id, name, color) VALUES (?, ?, ?)').run(venueId, 'Standard', '#4CAF50');
    const economy = await db.prepare('INSERT INTO seat_categories (venue_id, name, color) VALUES (?, ?, ?)').run(venueId, 'Economy', '#2196F3');

    const insertSeat = db.prepare(
      'INSERT INTO venue_seats (venue_id, row_num, col_num, category_id) VALUES (?, ?, ?, ?)'
    );
    for (let r = 1; r <= 8; r++) {
      for (let c = 1; c <= 10; c++) {
        let catId = economy.lastInsertRowid;
        if (r <= 2) catId = premium.lastInsertRowid;
        else if (r <= 5) catId = standard.lastInsertRowid;
        await insertSeat.run(venueId, r, c, catId);
      }
    }
    console.log('Seeded venue: Grand Cinema Hall (8x10)');
  }

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
