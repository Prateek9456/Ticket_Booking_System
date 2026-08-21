# System Design Write-Up

**Ticket Booking System — Prateek Vashishtha**

| Resource | URL |
|----------|-----|
| **Repository** | [github.com/Prateek9456/Ticket_Booking_System](https://github.com/Prateek9456/Ticket_Booking_System) |
| **Live app** | [ticket-booking-system-red.vercel.app](https://ticket-booking-system-red.vercel.app) |
| **Backend API** | [ticket-booking-system-pp6l.onrender.com/api](https://ticket-booking-system-pp6l.onrender.com/api) |
| **Health check** | [ticket-booking-system-pp6l.onrender.com/api/health](https://ticket-booking-system-pp6l.onrender.com/api/health) |

---

## Overview

The Ticket Booking System is a three-tier web application built with a React frontend (Vite), Express REST API, and a relational database. It supports three roles — **admin**, **organiser**, and **customer** — with role-based access control via JWT. The system handles concurrent seat selection for movies and concerts while keeping seat state consistent, managing hold expiry automatically, running a fair waitlist with time-limited offers on cancellation, and delivering transactional emails for bookings, account actions, and admin/organiser operations.

**Hosting:** Frontend on [Vercel](https://vercel.com) · Backend + PostgreSQL on [Render](https://render.com).

---

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────┐     SQL       ┌──────────────┐
│   React     │ ──────────────▶│   Express    │ ────────────▶ │  PostgreSQL  │
│   (Vercel)  │ ◀──────────────│   (Render)   │ ◀──────────── │  (Render)    │
└─────────────┘   JWT + JSON   └──────────────┘ transactions└──────────────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │  Brevo API   │
                               │  (email)     │
                               └──────────────┘
```

**Local development** uses the same Express API with a SQLite file at `backend/data/ticket_booking.db`. The database layer in `backend/src/db/database.js` selects PostgreSQL when `DATABASE_URL` is set, otherwise SQLite.

The frontend is a single-page application. Vercel rewrites all non-API routes to `index.html`, so direct navigation and page reloads on paths like `/organiser` or `/bookings` work correctly. API calls are proxied to the Render backend via `frontend/vercel.json`.

---

## Authentication and Session Management

All users (customers, organisers, admins) are stored in a single `users` table with a `role` column. Email addresses are unique and normalised (trimmed, lowercased) at registration and login. Display names may duplicate.

- **Registration:** Self-service for customer, organiser, and admin roles. Duplicate emails return HTTP 409 with guidance to log in or reset password.
- **Login:** JWT issued with 30-day expiry (`JWT_EXPIRES_IN`). Wrong password on a known email returns `forgotPassword: true` so the UI can offer reset.
- **Password reset:** 6-digit OTP emailed to the user, stored bcrypt-hashed in `email_otps` with 15-minute expiry. Works for all roles.
- **Session persistence:** The frontend stores the JWT and user object in `localStorage`. On reload, the token is validated via `GET /auth/me`. The session is cleared only on HTTP 401, not on transient network errors.

---

## Seat Hold and TTL Mechanism

When a customer selects seats and initiates a hold, the API executes an atomic conditional update for each seat:

```sql
UPDATE seat_status
SET status='held', held_by=?, hold_expires_at=?
WHERE event_id=? AND seat_id=? AND status='available'
```

If any seat in the batch is no longer available, the entire operation fails and the customer is notified immediately. This prevents partial holds that could confuse users.

The hold expiry timestamp is calculated as `current_time + SEAT_HOLD_TTL_MINUTES` (configurable, default 10 minutes). Held seats are rendered as unavailable on all other customers' seat maps. The frontend polls the seat map endpoint every five seconds, giving near-real-time visibility of status changes without WebSockets.

A `node-cron` scheduler runs every minute and executes `releaseExpiredHolds()`, which queries all seats where `status='held' AND hold_expires_at < now()` and resets them to `available`. This handles checkout abandonment without requiring the client to explicitly release seats. The same expiry check runs at the start of every hold and booking request as a safety net.

When a customer confirms a booking, seats transition from `held` to `booked` only if `status='held' AND held_by=current_user`. This two-phase flow (hold then confirm) gives customers time to review their selection while protecting inventory.

---

## Concurrency Prevention

The primary concurrency challenge is two customers attempting to hold or book the same seat at the same time. The system addresses this at the database layer using transactional semantics.

All seat mutations occur inside transaction blocks (`withTransaction` in `database.js`). The conditional UPDATE pattern is the core defence: rather than reading status and then writing (a classic read-modify-write race), the system attempts the state transition in a single atomic statement. Row-level locking during writes ensures that concurrent transactions serialize on the same row.

For booking confirmation, the transaction books all selected seats and creates the booking record atomically. If any seat fails the `held_by` check, the entire transaction rolls back. A `version` column on `seat_status` increments on every mutation, providing an audit trail and enabling future optimistic-locking extensions.

This approach avoids application-level mutexes or external infrastructure such as Redis locks. It works correctly when backed by a shared database and relies on standard ACID guarantees.

---

## Waitlist Auto-Assignment Flow

When all seats for an event are booked, customers can join a per-category waitlist. Each entry stores a monotonically assigned `position` within its `(event_id, category_id)` queue. The unique constraint on `(event_id, category_id, user_id)` prevents duplicate entries.

On booking cancellation, the system identifies the cancelled seat's category and queries the waitlist for the lowest-position entry with `status='waiting'`. That entry transitions to `offered`, receives a unique `offer_token`, and an `offer_expires_at` timestamp (default 15 minutes). An email is sent containing a link to `/waitlist-offer/:token`.

When the customer accepts the offer, the system finds an available seat in the matching category, holds it for the customer, and marks the waitlist entry as `completed`. The customer then completes the standard booking confirmation flow.

---

## Time-Limited Offer Handling

If a waitlisted customer does not accept within the offer window, the cron scheduler's `expireWaitlistOffers()` function marks the entry as `expired` and immediately attempts to offer the seat to the next person in the queue. This cascading re-offer ensures seats do not remain idle after a declined or ignored offer.

The offer acceptance endpoint validates three conditions: the token exists, the entry belongs to the requesting user, and `offer_expires_at` has not passed. Expired offers return HTTP 410, prompting the frontend to inform the user. The time-limited link in the email encodes only the opaque token — no sensitive data is exposed in the URL.

---

## Seat Map Data Model and Real-Time Updates

Each venue defines a grid (`rows` × `cols`) with seats assigned to categories. When an organiser creates an event, `initEventSeats()` populates a `seat_status` row per venue seat with `status='available'`. This per-event status table decouples venue layout from show-specific availability, allowing the same venue to host multiple events with independent seat states.

The frontend renders the grid by grouping seats by `row_num` and `col_num`, colouring each cell by category and overlaying status (available, held, booked). Category colours and prices come from joined `seat_categories` and `event_pricing` tables. Polling every five seconds keeps the UI aligned with backend state as holds expire or other customers book seats.

---

## Email Delivery

Email is sent through a provider chain: **Brevo API** (preferred for production on Render), **Resend**, or **SMTP/Nodemailer** (local development). Render's free tier blocks outbound SMTP ports, so Brevo is used in production.

| Event | Recipient |
|-------|-----------|
| Account registration | New user |
| Booking confirmation | Customer (with QR PNG attachment) |
| Booking cancellation | Customer |
| Password reset OTP | Any registered user |
| Event created / deleted | Organiser |
| Venue created / removed | Admin |
| Waitlist seat offer | Customer |

The `GET /api/health` endpoint reports which email provider is configured, whether the connection is valid, and which database backend is active (`postgresql` or `sqlite`).

---

## QR Code Generation and Booking Verification

On successful booking, the system generates a QR code (PNG buffer) encoding the `booking_ref` string using the `qrcode` library. The confirmation email includes booking details and the QR code as an attachment. At the venue, staff can scan the QR to call `GET /api/bookings/verify/:ref` for validation.

---

## Data Storage

| Environment | Engine | Location | Persistence |
|-------------|--------|----------|-------------|
| Local dev | SQLite | `backend/data/ticket_booking.db` | File on disk |
| Production | PostgreSQL | Render managed database | Survives redeploys and restarts |

The schema is defined in:

- `backend/src/db/schema.sql` (SQLite)
- `backend/src/db/schema.postgres.sql` (PostgreSQL)

Tables are created on server startup via `initDb()`. The admin account and demo venue are seeded on startup via `runSeed()` in `seed-data.js` (idempotent — only inserts if missing).

Production uses the **External Database URL** from Render as `DATABASE_URL`. The build step runs `npm install` only; database seeding happens at runtime when the server can reach PostgreSQL.

---

## Deployment Topology

```
GitHub (main)
    │
    ├──▶ Vercel ──▶ React SPA (ticket-booking-system-red.vercel.app)
    │                  │
    │                  └── /api/* proxied to Render
    │
    └──▶ Render ──▶ Express API (ticket-booking-system-pp6l.onrender.com)
                       │
                       └──▶ PostgreSQL (ticket-booking-db)
```

Environment configuration is documented in [`backend/.env.example`](../backend/.env.example) and [`frontend/.env.example`](../frontend/.env.example). The Render blueprint in [`render.yaml`](../render.yaml) provisions the API service and PostgreSQL database.

---

## Conclusion

The system's correctness relies on database-level atomic operations for concurrency, cron-driven expiry for automated lifecycle management, and a FIFO waitlist with cascading time-limited offers. Authentication is stateless JWT with email-based password recovery. Transactional email covers the full user lifecycle across all three roles. PostgreSQL on Render provides durable storage for accounts, events, and bookings in production. The seat map model separates venue layout from per-show availability, and polling delivers responsive status updates on the frontend. Together, these design choices produce a lightweight monolith suitable for free-tier cloud hosting on Render and Vercel.

---

**Author:** Prateek Vashishtha · [GitHub](https://github.com/Prateek9456)
