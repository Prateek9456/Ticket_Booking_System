const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const {
  confirmBooking,
  sendConfirmationEmail,
  cancelBooking,
  processWaitlistAfterCancellation,
  releaseExpiredHolds,
} = require('../services/seatHold');

const router = express.Router();

router.post('/confirm', authenticate, async (req, res) => {
  const { eventId, seatIds } = req.body;
  if (!eventId || !seatIds?.length) {
    return res.status(400).json({ error: 'eventId and seatIds required' });
  }

  try {
    const db = getDb();
    releaseExpiredHolds(db);
    const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
    const bookingData = confirmBooking(db, {
      eventId,
      seatIds,
      userId: req.user.id,
      userEmail: user.email,
      userName: user.name,
    });

    try {
      await sendConfirmationEmail(bookingData);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }

    res.status(201).json({
      bookingRef: bookingData.bookingRef,
      totalAmount: bookingData.totalAmount,
      seats: bookingData.seatDetails,
    });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.get('/my', authenticate, (req, res) => {
  const bookings = getDb().prepare(`
    SELECT b.*, e.title, e.event_date, e.event_time, e.type, v.name as venue_name
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    JOIN venues v ON v.id = e.venue_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);

  const db = getDb();
  const result = bookings.map((b) => ({
    ...b,
    seats: db.prepare(`
      SELECT vs.row_num, vs.col_num, bs.price, sc.name as category_name
      FROM booking_seats bs
      JOIN venue_seats vs ON vs.id = bs.seat_id
      JOIN seat_categories sc ON sc.id = vs.category_id
      WHERE bs.booking_id = ?
    `).all(b.id),
  }));

  res.json(result);
});

router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const { booking, releasedSeats } = cancelBooking(db, Number(req.params.id), req.user.id);

    for (const s of releasedSeats) {
      await processWaitlistAfterCancellation(db, booking.event_id, s.seat_id);
    }

    res.json({ message: 'Booking cancelled', bookingRef: booking.booking_ref });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/verify/:ref', (req, res) => {
  const booking = getDb().prepare(`
    SELECT b.*, e.title, e.event_date, e.event_time, u.name as customer_name
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    JOIN users u ON u.id = b.user_id
    WHERE b.booking_ref = ? AND b.status = 'confirmed'
  `).get(req.params.ref);

  if (!booking) return res.status(404).json({ error: 'Invalid booking reference' });
  res.json(booking);
});

module.exports = router;
