# System Design Write-Up

**Ticket Booking System — Prateek Vashishtha**

## Overview

The Ticket Booking System is a three-tier web application built with a React frontend, Express REST API, and SQLite database. It is designed to handle concurrent seat selection for movies and concerts while keeping seat state consistent, managing hold expiry automatically, and running a fair waitlist with time-limited offers when cancellations occur.

---

## Seat Hold and TTL Mechanism

When a customer selects seats on the visual grid and initiates a hold, the API executes an atomic conditional update for each seat:

```sql
UPDATE seat_status
SET status='held', held_by=?, hold_expires_at=?
WHERE event_id=? AND seat_id=? AND status='available'
```

If any seat in the batch is no longer available, the entire operation fails and the customer is notified immediately. This prevents partial holds that could confuse users.

The hold expiry timestamp is calculated as `current_time + SEAT_HOLD_TTL_MINUTES` (configurable, default 10 minutes). Held seats are rendered as unavailable on all other customers' seat maps. The frontend polls the seat map endpoint every five seconds, giving near-real-time visibility of status changes without WebSockets.

A `node-cron` scheduler runs every minute and executes `releaseExpiredHolds()`, which queries all seats where `status='held' AND hold_expires_at < now()` and resets them to `available`. This handles checkout abandonment without requiring the client to explicitly release seats. The same expiry check runs at the start of every hold and booking request as a safety net, ensuring stale holds never block legitimate bookings.

When a customer confirms a booking, seats transition from `held` to `booked` only if `status='held' AND held_by=current_user`. This two-phase flow (hold then confirm) gives customers time to review their selection while protecting inventory.

---

## Concurrency Prevention

The primary concurrency challenge is two customers attempting to hold or book the same seat at the same time. The system addresses this at the database layer using SQLite transactional semantics.

All seat mutations occur inside transaction blocks. The conditional UPDATE pattern is the core defence: rather than reading status and then writing (a classic read-modify-write race), the system attempts the state transition in a single atomic statement. SQLite row-level locking during writes ensures that concurrent transactions serialize on the same row.

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

## QR Code Generation and Email Delivery

On successful booking, the system generates a QR code (PNG buffer) encoding the `booking_ref` string using the `qrcode` library. Nodemailer sends a confirmation email with booking details and the QR code as an attachment. At the venue, staff can scan the QR to call `GET /api/bookings/verify/:ref` for validation. SMTP credentials are configurable; Ethereal Email provides a free testing tier for development and demos.

---

## Conclusion

The system's correctness relies on database-level atomic operations for concurrency, cron-driven expiry for automated lifecycle management, and a FIFO waitlist with cascading time-limited offers. The seat map model separates venue layout from per-show availability, and polling delivers responsive status updates on the frontend. Together, these design choices produce a lightweight monolith suitable for free-tier cloud hosting on Render and Vercel.
