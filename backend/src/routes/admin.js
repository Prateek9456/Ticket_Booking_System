const express = require('express');
const { getDb, withTransaction } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { isEmailConfigured, sendVenueCreated, sendVenueCancelled } = require('../services/email');

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/venues', (req, res) => {
  const venues = getDb().prepare('SELECT * FROM venues ORDER BY name').all();
  res.json(venues);
});

router.post('/venues', async (req, res) => {
  const { name, rows, cols, categories } = req.body;
  if (!name || !rows || !cols || !categories?.length) {
    return res.status(400).json({ error: 'Name, rows, cols, and categories are required' });
  }

  const db = getDb();
  try {
    const venueId = withTransaction(db, () => {
      const venue = db.prepare('INSERT INTO venues (name, rows, cols) VALUES (?, ?, ?)').run(name, rows, cols);
      const venueId = venue.lastInsertRowid;

      const catStmt = db.prepare('INSERT INTO seat_categories (venue_id, name, color) VALUES (?, ?, ?)');
      const seatStmt = db.prepare('INSERT INTO venue_seats (venue_id, row_num, col_num, category_id) VALUES (?, ?, ?, ?)');

      const catMap = {};
      for (const cat of categories) {
        const result = catStmt.run(venueId, cat.name, cat.color || '#4CAF50');
        catMap[cat.name] = result.lastInsertRowid;
      }

      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const matched = categories.find(
            (cat) => r >= (cat.rowStart || 1) && r <= (cat.rowEnd || rows)
          );
          const catId = catMap[matched?.name || categories[0].name];
          seatStmt.run(venueId, r, c, catId);
        }
      }

      return venueId;
    });

    let email = { sent: false };
    const admin = db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
    if (admin && isEmailConfigured()) {
      try {
        const info = await sendVenueCreated({
          to: admin.email,
          name: admin.name,
          venueName: name,
          rows,
          cols,
          categories,
        });
        email = { sent: true, sentTo: info.sentTo };
      } catch (emailErr) {
        console.error('Venue creation email failed:', emailErr.message);
        email = { sent: false, error: emailErr.message };
      }
    }

    res.status(201).json({ id: venueId, message: 'Venue created', email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/venues/:id', (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const categories = db.prepare('SELECT * FROM seat_categories WHERE venue_id = ?').all(venue.id);
  const seats = db.prepare(`
    SELECT vs.*, sc.name as category_name, sc.color
    FROM venue_seats vs JOIN seat_categories sc ON sc.id = vs.category_id
    WHERE vs.venue_id = ?
  `).all(venue.id);

  res.json({ ...venue, categories, seats });
});

router.delete('/venues/:id', async (req, res) => {
  const db = getDb();
  const venueId = Number(req.params.id);
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const eventCount = db.prepare('SELECT COUNT(*) as count FROM events WHERE venue_id = ?').get(venueId).count;
  if (eventCount > 0) {
    return res.status(400).json({ error: 'Cannot delete venue with existing events' });
  }

  try {
    withTransaction(db, () => {
      db.prepare('DELETE FROM venues WHERE id = ?').run(venueId);
    });

    let email = { sent: false };
    const admin = db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
    if (admin && isEmailConfigured()) {
      try {
        const info = await sendVenueCancelled({
          to: admin.email,
          name: admin.name,
          venueName: venue.name,
          rows: venue.rows,
          cols: venue.cols,
        });
        email = { sent: true, sentTo: info.sentTo };
      } catch (emailErr) {
        console.error('Venue deletion email failed:', emailErr.message);
        email = { sent: false, error: emailErr.message };
      }
    }

    res.json({ message: 'Venue deleted', email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
