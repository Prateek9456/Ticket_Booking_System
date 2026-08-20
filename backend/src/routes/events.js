const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

router.get('/', (req, res) => {
  const { type, search, date } = req.query;
  let sql = `
    SELECT e.*, v.name as venue_name, u.name as organiser_name,
      (SELECT MIN(ep.price) FROM event_pricing ep WHERE ep.event_id = e.id) as min_price,
      (SELECT COUNT(*) FROM seat_status ss WHERE ss.event_id = e.id AND ss.status = 'available') as available_seats,
      (SELECT COUNT(*) FROM seat_status ss WHERE ss.event_id = e.id) as total_seats
    FROM events e
    JOIN venues v ON v.id = e.venue_id
    JOIN users u ON u.id = e.organiser_id
    WHERE 1=1
  `;
  const params = [];

  if (type) { sql += ' AND e.type = ?'; params.push(type); }
  if (search) { sql += ' AND e.title LIKE ?'; params.push(`%${search}%`); }
  if (date) { sql += ' AND e.event_date = ?'; params.push(date); }

  sql += ' ORDER BY e.event_date ASC, e.event_time ASC';
  const events = getDb().prepare(sql).all(...params);
  res.json(events);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const event = db.prepare(`
    SELECT e.*, v.name as venue_name, v.rows, v.cols, u.name as organiser_name
    FROM events e
    JOIN venues v ON v.id = e.venue_id
    JOIN users u ON u.id = e.organiser_id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  const pricing = db.prepare(`
    SELECT ep.*, sc.name as category_name, sc.color
    FROM event_pricing ep JOIN seat_categories sc ON sc.id = ep.category_id
    WHERE ep.event_id = ?
  `).all(event.id);

  const seatCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM seat_status WHERE event_id = ? GROUP BY status
  `).all(event.id);

  res.json({ ...event, pricing, seatCounts });
});

module.exports = router;
