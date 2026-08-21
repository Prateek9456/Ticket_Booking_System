const express = require('express');
const { getDb, withTransaction } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { initEventSeats } = require('../services/seatHold');
const { isEmailConfigured, sendEventCreated, sendEventCancelled } = require('../services/email');

const router = express.Router();

router.use(authenticate, authorize('organiser'));

router.post('/events', async (req, res) => {
  const { title, type, venueId, eventDate, eventTime, description, pricing } = req.body;
  if (!title || !type || !venueId || !eventDate || !eventTime || !pricing?.length) {
    return res.status(400).json({ error: 'All event fields and pricing are required' });
  }

  const db = getDb();
  try {
    const eventId = await withTransaction(db, async () => {
      const event = await db.prepare(`
        INSERT INTO events (organiser_id, venue_id, title, type, event_date, event_time, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, venueId, title, type, eventDate, eventTime, description || '');

      const priceStmt = db.prepare('INSERT INTO event_pricing (event_id, category_id, price) VALUES (?, ?, ?)');
      for (const p of pricing) {
        await priceStmt.run(event.lastInsertRowid, p.categoryId, p.price);
      }

      await initEventSeats(db, event.lastInsertRowid, venueId);
      return event.lastInsertRowid;
    });

    let email = { sent: false };
    const organiser = await db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
    const venue = await db.prepare('SELECT name FROM venues WHERE id = ?').get(venueId);
    if (organiser && isEmailConfigured()) {
      try {
        const info = await sendEventCreated({
          to: organiser.email,
          name: organiser.name,
          title,
          type,
          venueName: venue?.name || 'Unknown venue',
          eventDate,
          eventTime,
        });
        email = { sent: true, sentTo: info.sentTo };
      } catch (emailErr) {
        console.error('Event creation email failed:', emailErr.message);
        email = { sent: false, error: emailErr.message };
      }
    }

    res.status(201).json({ id: eventId, message: 'Event created', email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/events', async (req, res) => {
  const events = await getDb().prepare(`
    SELECT e.*, v.name as venue_name,
      (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id AND b.status = 'confirmed') as booking_count,
      (SELECT COALESCE(SUM(b.total_amount), 0) FROM bookings b WHERE b.event_id = e.id AND b.status = 'confirmed') as revenue
    FROM events e JOIN venues v ON v.id = e.venue_id
    WHERE e.organiser_id = ?
    ORDER BY e.event_date DESC
  `).all(req.user.id);
  res.json(events);
});

router.delete('/events/:id', async (req, res) => {
  const db = getDb();
  const eventId = Number(req.params.id);

  const event = await db.prepare(`
    SELECT e.*, v.name as venue_name FROM events e
    JOIN venues v ON v.id = e.venue_id
    WHERE e.id = ? AND e.organiser_id = ?
  `).get(eventId, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const confirmedRow = await db.prepare(`
    SELECT COUNT(*) as count FROM bookings WHERE event_id = ? AND status = 'confirmed'
  `).get(eventId);
  const confirmedCount = Number(confirmedRow.count);

  if (confirmedCount > 0) {
    return res.status(400).json({ error: 'Cannot delete event with confirmed bookings' });
  }

  try {
    await withTransaction(db, async () => {
      await db.prepare('DELETE FROM bookings WHERE event_id = ?').run(eventId);
      await db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
    });

    let email = { sent: false };
    const organiser = await db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
    if (organiser && isEmailConfigured()) {
      try {
        const info = await sendEventCancelled({
          to: organiser.email,
          name: organiser.name,
          title: event.title,
          venueName: event.venue_name,
          eventDate: event.event_date,
          eventTime: event.event_time,
        });
        email = { sent: true, sentTo: info.sentTo };
      } catch (emailErr) {
        console.error('Event cancellation email failed:', emailErr.message);
        email = { sent: false, error: emailErr.message };
      }
    }

    res.json({ message: 'Event deleted', email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/events/:id/summary', async (req, res) => {
  const db = getDb();
  const event = await db.prepare(`
    SELECT e.*, v.name as venue_name FROM events e
    JOIN venues v ON v.id = e.venue_id
    WHERE e.id = ? AND e.organiser_id = ?
  `).get(req.params.id, req.user.id);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  const bookings = await db.prepare(`
    SELECT b.*, u.name as customer_name, u.email as customer_email
    FROM bookings b JOIN users u ON u.id = b.user_id
    WHERE b.event_id = ? AND b.status = 'confirmed'
    ORDER BY b.created_at DESC
  `).all(event.id);

  const seatStats = await db.prepare(`
    SELECT status, COUNT(*) as count FROM seat_status WHERE event_id = ? GROUP BY status
  `).all(event.id);

  const revenue = bookings.reduce((sum, b) => sum + b.total_amount, 0);

  res.json({ event, bookings, seatStats, revenue, totalBookings: bookings.length });
});

router.get('/venues', async (req, res) => {
  const venues = await getDb().prepare('SELECT id, name, rows, cols FROM venues ORDER BY name').all();
  const db = getDb();
  const result = await Promise.all(venues.map(async (v) => ({
    ...v,
    categories: await db.prepare('SELECT id, name, color FROM seat_categories WHERE venue_id = ?').all(v.id),
  })));
  res.json(result);
});

module.exports = router;
