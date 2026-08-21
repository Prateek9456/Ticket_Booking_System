# Ticket Booking System

**Author:** Prateek Vashishtha  
**Repository:** [https://github.com/Prateek9456/Ticket_Booking_System](https://github.com/Prateek9456/Ticket_Booking_System)

A full-stack ticket booking platform for movies and concerts. Customers book seats from a visual map with real-time status, held seats auto-release after a configurable TTL, sold-out events support a category waitlist with automatic re-offer on cancellation, and confirmed bookings trigger a QR code ticket by email.

---

## Live Application

| Service | URL |
|---------|-----|
| **Frontend** | [https://ticket-booking-system-red.vercel.app](https://ticket-booking-system-red.vercel.app) |
| **Backend API** | [https://ticket-booking-system-pp6l.onrender.com/api](https://ticket-booking-system-pp6l.onrender.com/api) |
| **Health Check** | [https://ticket-booking-system-pp6l.onrender.com/api/health](https://ticket-booking-system-pp6l.onrender.com/api/health) |

**Deployment:** Frontend on [Vercel](https://vercel.com) · Backend on [Render](https://render.com)

---

## Default Admin Account

The seed script creates one admin account if none exists:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ticketbooking.com | admin123 |

Customers, organisers, and additional admins register through the app at [/register](https://ticket-booking-system-red.vercel.app/register).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 20+, Express, SQLite (local) / PostgreSQL (production) |
| Frontend | React 18, Vite, React Router |
| Auth | JWT (30-day expiry) + bcrypt |
| Email | Brevo API (production), Resend, or SMTP/Nodemailer |
| QR Code | `qrcode` npm package |
| Scheduler | `node-cron` (seat hold and waitlist offer expiry) |

---

## Features

### Authentication (all roles)
- Register as **Customer**, **Organiser**, or **Admin**
- Unique email per account (names may duplicate)
- Login with JWT session persisted across page reloads
- Forgot password via email OTP verification (15-minute expiry)
- Wrong password on a registered email prompts password reset

### Admin
- Create and remove venues with row/column seat layout
- Define seat categories (Premium, Standard, Economy) with colours
- Confirmation email on venue create and remove

### Organiser
- Create movie or concert events with venue, date, time, and per-category pricing
- View booking summary and revenue per event
- Delete events with no confirmed bookings
- Confirmation email on event create and delete

### Customer
- Browse and filter events (type, search, date)
- Visual seat map with real-time status (available / held / booked)
- Hold selected seats with configurable TTL (default 10 minutes)
- Confirm booking and receive email with QR code ticket
- View all bookings (confirmed and cancelled) on the dashboard
- Cancel bookings with cancellation email notification
- Join waitlist for a seat category when sold out
- Accept time-limited waitlist offers via email link

### System
- Auto-release abandoned seat holds via cron scheduler
- Concurrency-safe hold and booking using SQLite transactions
- Waitlist auto-assignment on cancellation with cascading time-limited offers
- SPA routing on Vercel (no 404 on page reload)

---

## Project Structure

```
Ticket_Booking_System/
├── backend/
│   ├── src/
│   │   ├── db/              # Schema, database init, seed, reset-users
│   │   ├── middleware/      # JWT authentication
│   │   ├── routes/          # REST API endpoints
│   │   ├── services/        # Seat hold, email, OTP, QR code
│   │   ├── schedulers/      # Cron jobs for expiry
│   │   ├── config.js        # JWT settings
│   │   └── server.js
│   ├── data/                # SQLite database (gitignored, created at runtime)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # SeatMap, Navbar, EventCard
│   │   ├── pages/           # UI pages
│   │   ├── context/         # Auth context (localStorage session)
│   │   └── api.js
│   ├── vercel.json          # API proxy + SPA rewrites
│   └── package.json
├── docs/
│   └── SYSTEM_DESIGN.md       # System design write-up
├── render.yaml                # Render deployment blueprint
└── README.md
```

---

## Local Setup

### Prerequisites

- Node.js 20 or later
- npm

### 1. Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your `JWT_SECRET` and email credentials, then:

```bash
npm install
npm run seed
npm start
```

API runs at `http://localhost:3001`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`

The Vite dev server proxies `/api` requests to `http://localhost:3001`.

### Useful scripts

| Command | Description |
|---------|-------------|
| `npm run seed` | Create schema, seed admin account and demo venue |
| `npm run reset-users` | Clear all users, bookings, events; re-seed admin only |

---

## Environment Variables

### Backend (`backend/.env.example`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3001` |
| `JWT_SECRET` | Secret for JWT signing | *(required in production)* |
| `JWT_EXPIRES_IN` | Token lifetime | `30d` |
| `SEAT_HOLD_TTL_MINUTES` | Seat hold duration in minutes | `10` |
| `WAITLIST_OFFER_TTL_MINUTES` | Waitlist offer duration in minutes | `15` |
| `FRONTEND_URL` | Frontend URL for waitlist links | `http://localhost:5173` |
| `BREVO_API_KEY` | Brevo API key (recommended for production) | — |
| `BREVO_FROM_EMAIL` | Verified sender email in Brevo | — |
| `BREVO_FROM_NAME` | Sender display name | `Ticket Booking` |
| `RESEND_API_KEY` | Resend API key (test mode: your email only) | — |
| `RESEND_FROM` | Sender for Resend | `Ticket Booking <onboarding@resend.dev>` |
| `SMTP_HOST` | SMTP server host (local dev) | — |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | Sender address (SMTP) | — |

**Important:** Render **free tier blocks outbound SMTP**. Use **Brevo API** (free, no domain) for production. Resend test mode only delivers to your own email.

### Email setup on Render (required for live emails)

#### Option A — Brevo (recommended)

1. Sign up at [Brevo](https://www.brevo.com) (free, 300 emails/day, no credit card).
2. Go to **Senders & IP → Senders** → add your email → verify via the link Brevo sends.
3. Go to **SMTP & API → API Keys** → create an API key.
4. On Render, set:

| Variable | Value |
|----------|--------|
| `BREVO_API_KEY` | your Brevo API key (`xkeysib-...`) |
| `BREVO_FROM_EMAIL` | the verified sender email |
| `BREVO_FROM_NAME` | `Ticket Booking` |

5. Redeploy. Users receive registration, booking, cancellation, event/venue, and password-reset emails.

#### Option B — Resend (test mode only)

Without a paid custom domain, `onboarding@resend.dev` only delivers to the email you used on resend.com.

#### Option C — Gmail SMTP (local development only)

Render free tier blocks SMTP. Use Brevo on Render instead.

1. Enable 2-Step Verification on Google.
2. Create an **App Password** at [Google App Passwords](https://myaccount.google.com/apppasswords).
3. In `backend/.env`:

| Variable | Value |
|----------|--------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | 16-character app password |
| `SMTP_FROM` | `Ticket Booking <your@gmail.com>` |

### Frontend (production on Vercel)

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://ticket-booking-system-pp6l.onrender.com/api` |

### Backend (production on Render)

| Variable | Value |
|----------|--------|
| `FRONTEND_URL` | `https://ticket-booking-system-red.vercel.app` |
| `JWT_SECRET` | A long random secret string |
| `JWT_EXPIRES_IN` | `30d` |
| `DATABASE_URL` | PostgreSQL connection string (auto-set on Render) |
| `SEAT_HOLD_TTL_MINUTES` | `10` |
| `WAITLIST_OFFER_TTL_MINUTES` | `15` |
| `BREVO_API_KEY` | Brevo API key (recommended) |
| `BREVO_FROM_EMAIL` | Your verified Brevo sender email |
| `BREVO_FROM_NAME` | `Ticket Booking` |

---

## API Documentation

**Local base URL:** `http://localhost:3001/api`  
**Production base URL:** `https://ticket-booking-system-pp6l.onrender.com/api`

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|---------------|------|
| POST | `/auth/register` | Register (customer / organiser / admin) | No |
| POST | `/auth/login` | Login | No |
| POST | `/auth/forgot-password` | Send password-reset OTP email | No |
| POST | `/auth/reset-password` | Reset password with OTP | No |
| GET | `/auth/me` | Current user profile | Bearer |
| POST | `/auth/test-email` | Send test email to logged-in user | Bearer |

### Events (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/events` | List events (`?type`, `?search`, `?date`) |
| GET | `/events/:id` | Event details with pricing |

### Seats

| Method | Endpoint | Description | Auth |
|--------|----------|---------------|------|
| GET | `/seats/:eventId/map` | Seat map with status | No |
| POST | `/seats/:eventId/hold` | Hold seats | Bearer |
| POST | `/seats/:eventId/release` | Release held seats | Bearer |

### Bookings

| Method | Endpoint | Description | Auth |
|--------|----------|---------------|------|
| POST | `/bookings/confirm` | Confirm held seats | Bearer |
| GET | `/bookings/my` | All customer bookings (confirmed + cancelled) | Bearer |
| GET | `/bookings/:id/qr` | QR code for confirmed booking | Bearer |
| POST | `/bookings/:id/resend-email` | Resend confirmation email | Bearer |
| POST | `/bookings/:id/cancel` | Cancel booking | Bearer |
| GET | `/bookings/verify/:ref` | Verify booking by QR ref | No |

### Waitlist

| Method | Endpoint | Description | Auth |
|--------|----------|---------------|------|
| POST | `/waitlist/:eventId/join` | Join category waitlist | Bearer |
| GET | `/waitlist/:eventId/my` | My waitlist entries | Bearer |
| GET | `/waitlist/offer/:token` | View waitlist offer | Bearer |
| POST | `/waitlist/offer/:token/accept` | Accept offer and hold seat | Bearer |

### Admin

| Method | Endpoint | Description | Auth |
|--------|----------|---------------|------|
| GET | `/admin/venues` | List venues | Admin |
| POST | `/admin/venues` | Create venue | Admin |
| GET | `/admin/venues/:id` | Venue detail | Admin |
| DELETE | `/admin/venues/:id` | Remove venue (no events) | Admin |

### Organiser

| Method | Endpoint | Description | Auth |
|--------|----------|---------------|------|
| GET | `/organiser/venues` | List venues | Organiser |
| POST | `/organiser/events` | Create event | Organiser |
| GET | `/organiser/events` | My events | Organiser |
| GET | `/organiser/events/:id/summary` | Booking summary | Organiser |
| DELETE | `/organiser/events/:id` | Delete event | Organiser |

---

## Database

### Storage

| Environment | Database | Persistence |
|-------------|----------|-------------|
| **Local dev** | SQLite file at `backend/data/ticket_booking.db` | Survives restarts on your machine |
| **Production (Render)** | PostgreSQL via `DATABASE_URL` | Persistent — accounts, events, and bookings survive redeploys and long gaps between visits |

Locally, data is stored in a single SQLite file:

```
backend/data/ticket_booking.db
```

The file is created on first run and is **gitignored**. On Render, the app uses a **PostgreSQL** database (configured in `render.yaml`) so data is no longer lost when the server restarts or redeploys.

### Schema

| Table | Key Columns |
|-------|-------------|
| `users` | id, email (unique), password_hash, name, role (admin \| organiser \| customer) |
| `venues` | id, name, rows, cols |
| `seat_categories` | id, venue_id, name, color |
| `venue_seats` | id, venue_id, row_num, col_num, category_id |
| `events` | id, organiser_id, venue_id, title, type, event_date, event_time |
| `event_pricing` | id, event_id, category_id, price |
| `seat_status` | id, event_id, seat_id, status, held_by, hold_expires_at, version |
| `bookings` | id, booking_ref, user_id, event_id, status, total_amount |
| `booking_seats` | id, booking_id, seat_id, price |
| `waitlist` | id, event_id, category_id, user_id, position, status, offer_token, offer_expires_at |
| `email_otps` | id, email, otp_hash, purpose, expires_at, used_at |

Full SQL definition: [`backend/src/db/schema.sql`](backend/src/db/schema.sql)

### Inspecting the database locally

1. Run the backend or `npm run seed` to create `backend/data/ticket_booking.db`.
2. Open the file with [DB Browser for SQLite](https://sqlitebrowser.org/) or the **SQLite Viewer** extension in VS Code.
3. Example queries:

```sql
SELECT id, email, name, role FROM users;
SELECT booking_ref, status, total_amount FROM bookings;
```

---

## Seat Hold and Waitlist Logic

### Seat Hold TTL

1. Customer selects seats and clicks **Hold Seats**.
2. The API runs `UPDATE seat_status SET status='held'` only where `status='available'` (atomic per seat).
3. `hold_expires_at` is set to `now + SEAT_HOLD_TTL_MINUTES`.
4. A cron job runs every minute to release holds where `hold_expires_at < now`.
5. The frontend polls the seat map every 5 seconds for near-real-time updates.

### Concurrency Prevention

- Each hold and booking runs inside a SQLite transaction with a conditional `UPDATE ... WHERE status = 'available'` (or `'held' AND held_by = user`).
- If `changes === 0`, the operation fails — only one customer can hold or book a seat.
- A `version` column on `seat_status` tracks mutations for audit and optimistic locking.

### Waitlist Auto-Assignment

1. Customer joins the waitlist for a seat category when the event is sold out.
2. On booking cancellation, the system finds the next `waiting` entry for that category.
3. The customer receives an email with a time-limited offer link (`offer_expires_at`).
4. Accepting the offer holds an available seat in that category.
5. If the offer expires, the cron job marks it `expired` and offers to the next person in the queue.

For the full system design write-up, see [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md).

---

## Deployment

### Backend — Render

1. Create a **Web Service** with root directory `backend`.
2. Create a **PostgreSQL** database (free tier) and link it via `DATABASE_URL`.
3. **Instance type:** Free
4. **Build command:** `npm install && npm run seed`
5. **Start command:** `npm start`
6. Set environment variables from the table above.

Alternatively, use the included [`render.yaml`](render.yaml) blueprint — it provisions both the API and a PostgreSQL database automatically.

### Frontend — Vercel

1. Import the [GitHub repository](https://github.com/Prateek9456/Ticket_Booking_System).
2. Set root directory to `frontend`.
3. **Build command:** `npm run build`
4. Set `VITE_API_URL` to your Render API URL.
5. [`frontend/vercel.json`](frontend/vercel.json) proxies `/api` to Render and rewrites all routes to `index.html` for SPA routing.

---

## Submission Checklist

| Deliverable | Location |
|-------------|----------|
| Source code | This repository (`main` branch) |
| README (setup, env, API, DB, logic) | [`README.md`](README.md) |
| System design write-up | [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) |
| Hosted frontend | [ticket-booking-system-red.vercel.app](https://ticket-booking-system-red.vercel.app) |
| Hosted backend | [ticket-booking-system-pp6l.onrender.com](https://ticket-booking-system-pp6l.onrender.com) |
| Environment templates | [`backend/.env.example`](backend/.env.example), [`frontend/.env.example`](frontend/.env.example) |

**Excluded from the repository:** `node_modules/`, `.env`, `dist/`, `*.db`, editor-specific config.

### Creating a Zip Archive (if required)

```powershell
# Windows PowerShell — run from parent folder of Ticket_Booking_System
Compress-Archive -Path Ticket_Booking_System\backend, Ticket_Booking_System\frontend, Ticket_Booking_System\docs, Ticket_Booking_System\README.md, Ticket_Booking_System\render.yaml, Ticket_Booking_System\.gitignore -DestinationPath Ticket_Booking_System.zip -Force
```

Ensure the zip does **not** contain `node_modules/`, `.env`, `dist/`, or `*.db` files.

---

## License

MIT — see [LICENSE](LICENSE) (if included) or use as specified by your course/assignment.
