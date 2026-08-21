-- Users with role-based access
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'organiser', 'customer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venues managed by admin
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "rows" INTEGER NOT NULL,
  cols INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seat categories per venue (Premium, Standard, etc.)
CREATE TABLE IF NOT EXISTS seat_categories (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4CAF50',
  UNIQUE(venue_id, name)
);

-- Individual seats in a venue grid
CREATE TABLE IF NOT EXISTS venue_seats (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  row_num INTEGER NOT NULL,
  col_num INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES seat_categories(id),
  UNIQUE(venue_id, row_num, col_num)
);

-- Events created by organisers
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  organiser_id INTEGER NOT NULL REFERENCES users(id),
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'concert')),
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-category pricing for each event
CREATE TABLE IF NOT EXISTS event_pricing (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES seat_categories(id),
  price DOUBLE PRECISION NOT NULL,
  UNIQUE(event_id, category_id)
);

-- Per-show seat status (available / held / booked)
CREATE TABLE IF NOT EXISTS seat_status (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_id INTEGER NOT NULL REFERENCES venue_seats(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'held', 'booked')),
  held_by INTEGER REFERENCES users(id),
  hold_expires_at TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(event_id, seat_id)
);

-- Confirmed bookings
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  booking_ref TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'cancelled')),
  total_amount DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seats included in a booking
CREATE TABLE IF NOT EXISTS booking_seats (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id INTEGER NOT NULL REFERENCES venue_seats(id),
  price DOUBLE PRECISION NOT NULL
);

-- Waitlist queue per event per category
CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES seat_categories(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'offered', 'completed', 'expired', 'declined')),
  offer_token TEXT,
  offer_expires_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, category_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_seat_status_event ON seat_status(event_id);
CREATE INDEX IF NOT EXISTS idx_seat_status_hold_expires ON seat_status(hold_expires_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_event_category ON waitlist(event_id, category_id, position);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);

-- OTP codes for password reset (all roles)
CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'password_reset' CHECK(purpose IN ('password_reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);
