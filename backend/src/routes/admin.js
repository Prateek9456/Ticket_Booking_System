const express = require('express');
const { getDb, withTransaction } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/venues', (req, res) => {
  const venues = getDb().prepare('SELECT * FROM venues ORDER BY name').all();
  res.json(venues);
});

router.post('/venues', (req, res) => {
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
    res.status(201).json({ id: venueId, message: 'Venue created' });
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

module.exports = router;
