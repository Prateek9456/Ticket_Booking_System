const express = require('express');
const { getDb, withTransaction } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { holdSeats, releaseExpiredHolds } = require('../services/seatHold');

const router = express.Router();

router.get('/:eventId/map', async (req, res) => {
  const db = getDb();
  await releaseExpiredHolds(db);

  const event = await db.prepare('SELECT venue_id FROM events WHERE id = ?').get(req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const seats = await db.prepare(`
    SELECT vs.id as seat_id, vs.row_num, vs.col_num,
      sc.name as category_name, sc.color, sc.id as category_id,
      COALESCE(ss.status, 'available') as status,
      ss.held_by, ss.hold_expires_at, ep.price
    FROM venue_seats vs
    JOIN seat_categories sc ON sc.id = vs.category_id
    LEFT JOIN seat_status ss ON ss.seat_id = vs.id AND ss.event_id = ?
    LEFT JOIN event_pricing ep ON ep.event_id = ? AND ep.category_id = vs.category_id
    WHERE vs.venue_id = ?
    ORDER BY vs.row_num, vs.col_num
  `).all(req.params.eventId, req.params.eventId, event.venue_id);

  const venue = await db.prepare('SELECT rows, cols FROM venues WHERE id = ?').get(event.venue_id);
  res.json({ rows: venue.rows, cols: venue.cols, seats });
});

router.post('/:eventId/hold', authenticate, async (req, res) => {
  const { seatIds } = req.body;
  if (!seatIds?.length) return res.status(400).json({ error: 'seatIds required' });

  try {
    const db = getDb();
    await releaseExpiredHolds(db);
    const result = await holdSeats(db, Number(req.params.eventId), seatIds, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.post('/:eventId/release', authenticate, async (req, res) => {
  const { seatIds } = req.body;
  const db = getDb();
  const release = db.prepare(`
    UPDATE seat_status
    SET status = 'available', held_by = NULL, hold_expires_at = NULL, version = version + 1
    WHERE event_id = ? AND seat_id = ? AND held_by = ? AND status = 'held'
  `);

  await withTransaction(db, async () => {
    for (const seatId of seatIds) await release.run(req.params.eventId, seatId, req.user.id);
  });
  res.json({ message: 'Seats released' });
});

module.exports = router;
