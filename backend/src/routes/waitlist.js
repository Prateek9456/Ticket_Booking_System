const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { joinWaitlist, acceptWaitlistOffer } = require('../services/seatHold');

const router = express.Router();

router.post('/:eventId/join', authenticate, async (req, res) => {
  const { categoryId } = req.body;
  if (!categoryId) return res.status(400).json({ error: 'categoryId required' });

  try {
    const result = await joinWaitlist(getDb(), Number(req.params.eventId), categoryId, req.user.id);
    res.status(201).json(result);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.get('/:eventId/my', authenticate, async (req, res) => {
  const entries = await getDb().prepare(`
    SELECT w.*, sc.name as category_name
    FROM waitlist w JOIN seat_categories sc ON sc.id = w.category_id
    WHERE w.event_id = ? AND w.user_id = ?
    ORDER BY w.position
  `).all(req.params.eventId, req.user.id);
  res.json(entries);
});

router.get('/offer/:token', authenticate, async (req, res) => {
  const entry = await getDb().prepare(`
    SELECT w.*, e.title, e.event_date, e.event_time, sc.name as category_name
    FROM waitlist w
    JOIN events e ON e.id = w.event_id
    JOIN seat_categories sc ON sc.id = w.category_id
    WHERE w.offer_token = ? AND w.user_id = ?
  `).get(req.params.token, req.user.id);

  if (!entry) return res.status(404).json({ error: 'Offer not found' });
  if (entry.status !== 'offered') return res.status(410).json({ error: 'Offer no longer valid' });
  if (new Date(entry.offer_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Offer has expired' });
  }

  res.json(entry);
});

router.post('/offer/:token/accept', authenticate, async (req, res) => {
  try {
    const result = await acceptWaitlistOffer(getDb(), req.params.token, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

module.exports = router;
