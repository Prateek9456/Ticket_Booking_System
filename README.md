# Ticket Booking System

A full-stack ticket booking platform for movies and concerts with visual seat maps, seat hold TTL, waitlist auto-assignment, QR code tickets via email, and role-based access (Admin / Organiser / Customer).

## Live Demo

> Deploy backend to [Render](https://render.com) and frontend to [Vercel](https://vercel.com) using the instructions below, then update this URL.

**Hosted URL:** _To be deployed — see [Deployment](#deployment)_

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Node.js, Express, SQLite (node:sqlite) |
| Frontend | React, Vite, React Router           |
| Auth     | JWT + bcrypt                        |
| Email    | Nodemailer (Ethereal / SMTP)        |
| QR Code  | qrcode npm package                  |
| Scheduler| node-cron (seat hold & offer expiry) |

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your JWT_SECRET and SMTP credentials
npm install
npm run seed    # Creates demo users, venue, and events
npm start       # Runs on http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev     # Runs on http://localhost:5173
```

### Demo Accounts

| Role      | Email                    | Password      |
|-----------|--------------------------|---------------|
| Admin     | admin@ticketbooking.com  | admin123      |
| Organiser | organiser@demo.com       | organiser123  |
| Customer  | customer@demo.com        | customer123   |

## Features

- **Admin**: Create venues with seat layout and categories (Premium, Standard, Economy)
- **Organiser**: Register/login, create movie/concert events with per-category pricing, view booking summary and revenue
- **Customer**: Browse/filter events, visual seat map with real-time status (available / held / booked)
- **Seat Hold**: Configurable TTL (default 10 min); auto-release on abandonment via cron scheduler
- **Concurrency**: SQLite transactions with conditional UPDATE prevent double-booking
- **Waitlist**: Join waitlist per category when sold out; auto-offer on cancellation with time-limited link
- **QR Ticket**: Booking confirmation email with QR code encoding booking reference
- **Booking History**: View and cancel bookings

## Environment Variables

See `backend/.env.example`:

| Variable                  | Description                          | Default              |
|---------------------------|--------------------------------------|----------------------|
| PORT                      | API server port                      | 3001                 |
| JWT_SECRET                | Secret for JWT signing               | (required)           |
| SEAT_HOLD_TTL_MINUTES     | Seat hold duration                   | 10                   |
| WAITLIST_OFFER_TTL_MINUTES| Waitlist offer duration              | 15                   |
| FRONTEND_URL              | Frontend URL for waitlist links      | http://localhost:5173|
| SMTP_HOST/PORT/USER/PASS  | Email delivery credentials           | Ethereal test SMTP   |

For testing email without a real SMTP server, create a free account at [Ethereal Email](https://ethereal.email) and paste credentials into `.env`.

## API Documentation

Base URL: `http://localhost:3001/api`

### Authentication

| Method | Endpoint           | Description                | Auth     |
|--------|--------------------|----------------------------|----------|
| POST   | /auth/register     | Register (customer/organiser)| No     |
| POST   | /auth/login        | Login                      | No       |
| GET    | /auth/me           | Current user               | Bearer   |

### Events (Public)

| Method | Endpoint           | Description                |
|--------|--------------------|----------------------------|
| GET    | /events            | List events (?type, ?search, ?date) |
| GET    | /events/:id        | Event details with pricing |

### Seats

| Method | Endpoint                  | Description              | Auth   |
|--------|---------------------------|--------------------------|--------|
| GET    | /seats/:eventId/map       | Seat map with status     | No     |
| POST   | /seats/:eventId/hold      | Hold seats               | Bearer |
| POST   | /seats/:eventId/release   | Release held seats       | Bearer |

### Bookings

| Method | Endpoint              | Description               | Auth   |
|--------|-----------------------|---------------------------|--------|
| POST   | /bookings/confirm     | Confirm held seats        | Bearer |
| GET    | /bookings/my          | Customer booking history  | Bearer |
| POST   | /bookings/:id/cancel  | Cancel booking            | Bearer |
| GET    | /bookings/verify/:ref | Verify booking by QR ref  | No     |

### Waitlist

| Method | Endpoint                        | Description            | Auth   |
|--------|---------------------------------|------------------------|--------|
| POST   | /waitlist/:eventId/join         | Join category waitlist | Bearer |
| GET    | /waitlist/:eventId/my           | My waitlist entries    | Bearer |
| GET    | /waitlist/offer/:token          | View waitlist offer    | Bearer |
| POST   | /waitlist/offer/:token/accept   | Accept offer & hold seat| Bearer |

### Admin

| Method | Endpoint        | Description     | Auth (admin) |
|--------|-----------------|-----------------|--------------|
| GET    | /admin/venues   | List venues     | Yes          |
| POST   | /admin/venues   | Create venue    | Yes          |
| GET    | /admin/venues/:id | Venue detail  | Yes          |

### Organiser

| Method | Endpoint                      | Description          | Auth (organiser) |
|--------|-------------------------------|----------------------|------------------|
| GET    | /organiser/venues             | List venues          | Yes              |
| POST   | /organiser/events             | Create event         | Yes              |
| GET    | /organiser/events             | My events            | Yes              |
| GET    | /organiser/events/:id/summary | Booking summary    | Yes              |

## Database Schema

```
users            — id, email, password_hash, name, role (admin|organiser|customer)
venues           — id, name, rows, cols
seat_categories  — id, venue_id, name, color
venue_seats      — id, venue_id, row_num, col_num, category_id
events           — id, organiser_id, venue_id, title, type, event_date, event_time
event_pricing    — id, event_id, category_id, price
seat_status      — id, event_id, seat_id, status, held_by, hold_expires_at, version
bookings         — id, booking_ref, user_id, event_id, status, total_amount
booking_seats    — id, booking_id, seat_id, price
waitlist         — id, event_id, category_id, user_id, position, status, offer_token, offer_expires_at
```

Full SQL: `backend/src/db/schema.sql`

## Seat Hold & Waitlist Logic

### Seat Hold TTL

1. Customer selects seats and clicks **Hold Seats**
2. API runs `UPDATE seat_status SET status='held'` only where `status='available'` (atomic per seat)
3. `hold_expires_at` is set to `now + SEAT_HOLD_TTL_MINUTES`
4. A cron job runs every minute to release holds where `hold_expires_at < now`
5. Seat map polls every 5 seconds on the frontend for real-time updates

### Concurrency Prevention

- Each hold/booking uses a SQLite transaction with conditional `UPDATE ... WHERE status = 'available'` (or `'held' AND held_by = user`)
- If `changes === 0`, the operation fails — only one customer can hold/book a seat
- A `version` column supports optimistic concurrency tracking

### Waitlist Auto-Assignment

1. Customer joins waitlist for a seat category when event is sold out
2. On booking cancellation, system finds next `waiting` entry for that category
3. Customer receives email with time-limited offer link (`offer_expires_at`)
4. Accepting the offer holds an available seat in that category
5. If offer expires, cron marks it `expired` and offers to the next person in queue

See `docs/SYSTEM_DESIGN.md` for the full 800-word system design write-up.

## Deployment

### Backend (Render)

1. Create a new **Web Service** pointing to `/backend`
2. Build: `npm install && npm run seed`
3. Start: `npm start`
4. Set environment variables from `.env.example`

### Frontend (Vercel)

1. Import repo, set root to `/frontend`
2. Build: `npm run build`
3. Set `VITE_API_URL` or configure Vercel rewrites to proxy `/api` to backend URL

## Project Structure

```
Ticket_Booking_System/
├── backend/
│   ├── src/
│   │   ├── db/           # Schema, database init, seed
│   │   ├── middleware/   # JWT auth
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Seat hold, email, QR
│   │   ├── schedulers/   # Cron jobs
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # SeatMap, Navbar, EventCard
│   │   ├── pages/        # All UI pages
│   │   ├── context/      # Auth context
│   │   └── api.js
│   └── package.json
├── docs/
│   └── SYSTEM_DESIGN.md
└── README.md
```

## License

MIT
