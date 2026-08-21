const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { generateBookingQR } = require('../services/qr');
const { isEmailConfigured, sendBookingConfirmation } = require('../services/email');
const {
  confirmBooking,
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

    const dbUser = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.user.id);
    if (!dbUser) {
      return res.status(401).json({ error: 'Session expired. Please log out and log in again.' });
    }

    const userEmail = dbUser.email || req.user.email;
    const userName = dbUser.name || req.user.name;

    const bookingData = confirmBooking(db, {
      eventId,
      seatIds,
      userId: req.user.id,
      userEmail,
      userName,
    });

    const qrBuffer = await generateBookingQR(bookingData.bookingRef);
    const seats = bookingData.seatDetails
      .map((s) => `Row ${s.row} Col ${s.col} (${s.category})`)
      .join(', ');

    let email = { sent: false };
    if (isEmailConfigured()) {
      try {
        const info = await sendBookingConfirmation({
          to: userEmail,
          name: userName,
          bookingRef: bookingData.bookingRef,
          eventTitle: bookingData.event.title,
          eventDate: bookingData.event.event_date,
          eventTime: bookingData.event.event_time,
          seats,
          qrBuffer,
        });
        email = {
          sent: true,
          previewUrl: info.previewUrl,
          usingTestInbox: Boolean(info.previewUrl),
          sentTo: info.sentTo,
        };
      } catch (emailErr) {
        console.error('Email send failed:', emailErr.message);
        email = { sent: false, error: emailErr.message, sentTo: userEmail };
      }
    } else {
      email = {
        sent: false,
        error: 'Email is not configured on the server. Add RESEND_API_KEY or SMTP environment variables on Render.',
        sentTo: userEmail,
      };
    }

    res.status(201).json({
      bookingRef: bookingData.bookingRef,
      totalAmount: bookingData.totalAmount,
      seats: bookingData.seatDetails,
      qrCode: `data:image/png;base64,${qrBuffer.toString('base64')}`,
      email,
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

router.get('/:id/qr', authenticate, async (req, res) => {
  const booking = getDb().prepare(`
    SELECT booking_ref FROM bookings WHERE id = ? AND user_id = ? AND status = 'confirmed'
  `).get(Number(req.params.id), req.user.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const qrBuffer = await generateBookingQR(booking.booking_ref);
  res.json({
    bookingRef: booking.booking_ref,
    qrCode: `data:image/png;base64,${qrBuffer.toString('base64')}`,
  });
});

router.post('/:id/resend-email', authenticate, async (req, res) => {
  const db = getDb();
  const booking = db.prepare(`
    SELECT b.*, e.title, e.event_date, e.event_time, u.email, u.name
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    JOIN users u ON u.id = b.user_id
    WHERE b.id = ? AND b.user_id = ? AND b.status = 'confirmed'
  `).get(Number(req.params.id), req.user.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email is not configured on the server.' });
  }

  const seatRows = db.prepare(`
    SELECT vs.row_num, vs.col_num, sc.name as category_name
    FROM booking_seats bs
    JOIN venue_seats vs ON vs.id = bs.seat_id
    JOIN seat_categories sc ON sc.id = vs.category_id
    WHERE bs.booking_id = ?
  `).all(booking.id);

  const seats = seatRows.map((s) => `Row ${s.row_num} Col ${s.col_num} (${s.category_name})`).join(', ');
  const qrBuffer = await generateBookingQR(booking.booking_ref);

  try {
    const info = await sendBookingConfirmation({
      to: booking.email,
      name: booking.name,
      bookingRef: booking.booking_ref,
      eventTitle: booking.title,
      eventDate: booking.event_date,
      eventTime: booking.event_time,
      seats,
      qrBuffer,
    });

    res.json({
      message: 'Email sent',
      sentTo: booking.email,
      previewUrl: info.previewUrl || null,
      provider: info.provider || null,
      messageId: info.messageId || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
