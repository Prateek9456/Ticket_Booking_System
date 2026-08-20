const { v4: uuidv4 } = require('uuid');
const { getDb, withTransaction } = require('../db/database');
const { generateBookingQR } = require('./qr');
const { sendBookingConfirmation, sendWaitlistOffer } = require('./email');

const HOLD_TTL = () => Number(process.env.SEAT_HOLD_TTL_MINUTES) || 10;
const OFFER_TTL = () => Number(process.env.WAITLIST_OFFER_TTL_MINUTES) || 15;

function holdExpiresAt() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + HOLD_TTL());
  return d.toISOString();
}

function offerExpiresAt() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + OFFER_TTL());
  return d.toISOString();
}

function initEventSeats(db, eventId, venueId) {
  const seats = db.prepare('SELECT id FROM venue_seats WHERE venue_id = ?').all(venueId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO seat_status (event_id, seat_id, status) VALUES (?, ?, 'available')"
  );
  for (const s of seats) insert.run(eventId, s.id);
}

function releaseExpiredHolds(db) {
  const now = new Date().toISOString();
  const expired = db.prepare(`
    SELECT id, event_id, seat_id FROM seat_status
    WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?
  `).all(now);

  if (expired.length === 0) return 0;

  const release = db.prepare(`
    UPDATE seat_status
    SET status = 'available', held_by = NULL, hold_expires_at = NULL, version = version + 1
    WHERE id = ? AND status = 'held'
  `);

  withTransaction(db, () => {
    for (const row of expired) release.run(row.id);
  });
  return expired.length;
}

function holdSeats(db, eventId, seatIds, userId) {
  const expires = holdExpiresAt();
  const hold = db.prepare(`
    UPDATE seat_status
    SET status = 'held', held_by = ?, hold_expires_at = ?, version = version + 1
    WHERE event_id = ? AND seat_id = ? AND status = 'available'
  `);

  withTransaction(db, () => {
    for (const seatId of seatIds) {
      const result = hold.run(userId, expires, eventId, seatId);
      if (result.changes === 0) {
        const current = db.prepare(
          'SELECT status, held_by FROM seat_status WHERE event_id = ? AND seat_id = ?'
        ).get(eventId, seatId);

        if (current?.status === 'held' && current.held_by === userId) continue;
        throw new Error(`Seat ${seatId} is not available`);
      }
    }
  });

  return { expiresAt: expires };
}

function confirmBooking(db, { eventId, seatIds, userId, userEmail, userName }) {
  const bookingRef = `BK-${uuidv4().slice(0, 8).toUpperCase()}`;

  const event = db.prepare(`
    SELECT e.*, v.name as venue_name FROM events e
    JOIN venues v ON v.id = e.venue_id WHERE e.id = ?
  `).get(eventId);

  if (!event) throw new Error('Event not found');

  const getPrice = db.prepare(`
    SELECT ep.price, vs.row_num, vs.col_num, sc.name as category_name
    FROM venue_seats vs
    JOIN seat_categories sc ON sc.id = vs.category_id
    JOIN event_pricing ep ON ep.category_id = vs.category_id AND ep.event_id = ?
    WHERE vs.id = ?
  `);

  const bookSeat = db.prepare(`
    UPDATE seat_status
    SET status = 'booked', held_by = NULL, hold_expires_at = NULL, version = version + 1
    WHERE event_id = ? AND seat_id = ? AND status = 'held' AND held_by = ?
  `);

  let totalAmount = 0;
  const seatDetails = [];

  const result = withTransaction(db, () => {
    for (const seatId of seatIds) {
      const bookResult = bookSeat.run(eventId, seatId, userId);
      if (bookResult.changes === 0) {
        throw new Error(`Seat ${seatId} is not held by you or hold expired`);
      }
      const info = getPrice.get(eventId, seatId);
      totalAmount += info.price;
      seatDetails.push({ seatId, price: info.price, row: info.row_num, col: info.col_num, category: info.category_name });
    }

    const booking = db.prepare(`
      INSERT INTO bookings (booking_ref, user_id, event_id, total_amount) VALUES (?, ?, ?, ?)
    `).run(bookingRef, userId, eventId, totalAmount);

    const insertSeat = db.prepare('INSERT INTO booking_seats (booking_id, seat_id, price) VALUES (?, ?, ?)');
    for (const s of seatDetails) {
      insertSeat.run(booking.lastInsertRowid, s.seatId, s.price);
    }

    return { bookingId: booking.lastInsertRowid, bookingRef, totalAmount, seatDetails };
  });

  return { ...result, event, userEmail, userName };
}

async function sendConfirmationEmail(bookingData) {
  const { bookingRef, event, seatDetails, userEmail, userName } = bookingData;
  const seats = seatDetails.map((s) => `Row ${s.row} Col ${s.col} (${s.category})`).join(', ');
  const qrBuffer = await generateBookingQR(bookingRef);
  await sendBookingConfirmation({
    to: userEmail,
    name: userName,
    bookingRef,
    eventTitle: event.title,
    eventDate: event.event_date,
    eventTime: event.event_time,
    seats,
    qrBuffer,
  });
}

function cancelBooking(db, bookingId, userId) {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(bookingId, userId);
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') throw new Error('Booking already cancelled');

  const seats = db.prepare('SELECT seat_id FROM booking_seats WHERE booking_id = ?').all(bookingId);

  withTransaction(db, () => {
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(bookingId);
    const release = db.prepare(`
      UPDATE seat_status SET status = 'available', held_by = NULL, hold_expires_at = NULL, version = version + 1
      WHERE event_id = ? AND seat_id = ?
    `);
    for (const s of seats) release.run(booking.event_id, s.seat_id);
  });

  return { booking, releasedSeats: seats };
}

function getCategoryForSeat(db, eventId, seatId) {
  return db.prepare(`
    SELECT vs.category_id, sc.name as category_name
    FROM venue_seats vs
    JOIN seat_categories sc ON sc.id = vs.category_id
    WHERE vs.id = ?
  `).get(seatId);
}

function offerWaitlistSeat(db, eventId, categoryId) {
  const next = db.prepare(`
    SELECT w.*, u.email, u.name FROM waitlist w
    JOIN users u ON u.id = w.user_id
    WHERE w.event_id = ? AND w.category_id = ? AND w.status = 'waiting'
    ORDER BY w.position ASC LIMIT 1
  `).get(eventId, categoryId);

  if (!next) return null;

  const token = uuidv4();
  const expires = offerExpiresAt();

  db.prepare(`
    UPDATE waitlist SET status = 'offered', offer_token = ?, offer_expires_at = ?
    WHERE id = ?
  `).run(token, expires, next.id);

  const event = db.prepare('SELECT title FROM events WHERE id = ?').get(eventId);
  const category = db.prepare('SELECT name FROM seat_categories WHERE id = ?').get(categoryId);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  return {
    waitlistEntry: next,
    offerLink: `${frontendUrl}/waitlist-offer/${token}`,
    expiresAt: expires,
    eventTitle: event.title,
    categoryName: category.name,
  };
}

async function processWaitlistAfterCancellation(db, eventId, seatId) {
  const cat = getCategoryForSeat(db, eventId, seatId);
  if (!cat) return;

  const offer = offerWaitlistSeat(db, eventId, cat.category_id);
  if (!offer) return;

  try {
    await sendWaitlistOffer({
      to: offer.waitlistEntry.email,
      name: offer.waitlistEntry.name,
      eventTitle: offer.eventTitle,
      categoryName: offer.categoryName,
      offerLink: offer.offerLink,
      expiresAt: offer.expiresAt,
    });
  } catch (err) {
    console.error('Failed to send waitlist offer email:', err.message);
  }
}

function expireWaitlistOffers(db) {
  const now = new Date().toISOString();
  const expired = db.prepare(`
    SELECT * FROM waitlist WHERE status = 'offered' AND offer_expires_at < ?
  `).all(now);

  for (const entry of expired) {
    db.prepare("UPDATE waitlist SET status = 'expired' WHERE id = ?").run(entry.id);

    const availableSeat = db.prepare(`
      SELECT ss.seat_id FROM seat_status ss
      JOIN venue_seats vs ON vs.id = ss.seat_id
      WHERE ss.event_id = ? AND vs.category_id = ? AND ss.status = 'available'
      LIMIT 1
    `).get(entry.event_id, entry.category_id);

    if (availableSeat) {
      processWaitlistAfterCancellation(db, entry.event_id, availableSeat.seat_id);
    }
  }
  return expired.length;
}

function joinWaitlist(db, eventId, categoryId, userId) {
  const maxPos = db.prepare(`
    SELECT COALESCE(MAX(position), 0) as max_pos FROM waitlist
    WHERE event_id = ? AND category_id = ?
  `).get(eventId, categoryId);

  try {
    db.prepare(`
      INSERT INTO waitlist (event_id, category_id, user_id, position, status)
      VALUES (?, ?, ?, ?, 'waiting')
    `).run(eventId, categoryId, userId, maxPos.max_pos + 1);
    return { position: maxPos.max_pos + 1 };
  } catch {
    throw new Error('Already on waitlist for this category');
  }
}

function acceptWaitlistOffer(db, token, userId) {
  const entry = db.prepare(`
    SELECT * FROM waitlist WHERE offer_token = ? AND user_id = ? AND status = 'offered'
  `).get(token, userId);

  if (!entry) throw new Error('Invalid or expired offer');
  if (new Date(entry.offer_expires_at) < new Date()) {
    db.prepare("UPDATE waitlist SET status = 'expired' WHERE id = ?").run(entry.id);
    throw new Error('Offer has expired');
  }

  const seat = db.prepare(`
    SELECT ss.seat_id FROM seat_status ss
    JOIN venue_seats vs ON vs.id = ss.seat_id
    WHERE ss.event_id = ? AND vs.category_id = ? AND ss.status = 'available'
    LIMIT 1
  `).get(entry.event_id, entry.category_id);

  if (!seat) throw new Error('No available seat in this category');

  const expires = holdExpiresAt();
  const result = db.prepare(`
    UPDATE seat_status SET status = 'held', held_by = ?, hold_expires_at = ?, version = version + 1
    WHERE event_id = ? AND seat_id = ? AND status = 'available'
  `).run(userId, expires, entry.event_id, seat.seat_id);

  if (result.changes === 0) throw new Error('Seat no longer available');

  db.prepare("UPDATE waitlist SET status = 'completed' WHERE id = ?").run(entry.id);

  return { eventId: entry.event_id, seatIds: [seat.seat_id], expiresAt: expires };
}

module.exports = {
  initEventSeats,
  releaseExpiredHolds,
  holdSeats,
  confirmBooking,
  sendConfirmationEmail,
  cancelBooking,
  processWaitlistAfterCancellation,
  expireWaitlistOffers,
  joinWaitlist,
  acceptWaitlistOffer,
  HOLD_TTL,
  OFFER_TTL,
};
