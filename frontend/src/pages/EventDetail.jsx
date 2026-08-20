import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import SeatMap from '../components/SeatMap';

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [seatData, setSeatData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [heldSeats, setHeldSeats] = useState([]);
  const [holdExpires, setHoldExpires] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitlistEntries, setWaitlistEntries] = useState([]);
  const [bookingResult, setBookingResult] = useState(null);

  const loadSeatMap = useCallback(() => {
    api.getSeatMap(id).then(setSeatData).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.getEvent(id).then(setEvent).catch((err) => setError(err.message));
    loadSeatMap();
    const interval = setInterval(loadSeatMap, 5000);
    return () => clearInterval(interval);
  }, [id, loadSeatMap]);

  useEffect(() => {
    if (user) {
      api.getMyWaitlist(id).then(setWaitlistEntries).catch(() => {});
    }
  }, [id, user]);

  const availableCount = event?.seatCounts?.find((s) => s.status === 'available')?.count ?? 0;
  const soldOut = availableCount === 0 && (event?.seatCounts?.length ?? 0) > 0;

  function toggleSeat(seatId) {
    setSelected((prev) =>
      prev.includes(seatId) ? prev.filter((s) => s !== seatId) : [...prev, seatId]
    );
  }

  async function handleHold() {
    if (!user) { navigate('/login'); return; }
    if (selected.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.holdSeats(id, selected);
      setHeldSeats(selected);
      setHoldExpires(result.expiresAt);
      setMessage(`Seats held until ${new Date(result.expiresAt).toLocaleTimeString()}`);
      loadSeatMap();
    } catch (err) {
      setError(err.message);
      loadSeatMap();
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError('');
    setBookingResult(null);
    try {
      const seats = heldSeats.length ? heldSeats : selected;
      const result = await api.confirmBooking(Number(id), seats);
      setBookingResult(result);
      setMessage(`Booking confirmed! Reference: ${result.bookingRef}`);
      setSelected([]);
      setHeldSeats([]);
      loadSeatMap();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinWaitlist(categoryId) {
    if (!user) { navigate('/login'); return; }
    try {
      const result = await api.joinWaitlist(id, categoryId);
      setMessage(`Joined waitlist at position ${result.position}`);
      api.getMyWaitlist(id).then(setWaitlistEntries);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!event) return <div className="container"><p>Loading...</p></div>;

  const categories = [...new Map(event.pricing.map((p) => [p.category_id, p])).values()];

  return (
    <div className="container">
      <Link to="/">&larr; Back to events</Link>
      <h1 className="page-title" style={{ marginTop: '1rem' }}>{event.title}</h1>
      <div className="card">
        <span className={`badge badge-${event.type}`}>{event.type}</span>
        <p style={{ marginTop: '0.5rem' }}>{event.venue_name} &middot; {event.event_date} at {event.event_time}</p>
        <p style={{ color: '#6b7280' }}>{event.description}</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {bookingResult && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>Your Ticket</h3>
          <p><strong>Reference:</strong> {bookingResult.bookingRef}</p>
          {bookingResult.email?.sentTo && (
            <p><strong>Email sent to:</strong> {bookingResult.email.sentTo}</p>
          )}
          {bookingResult.qrCode && (
            <img
              src={bookingResult.qrCode}
              alt={`QR code for booking ${bookingResult.bookingRef}`}
              style={{ display: 'block', margin: '1rem 0', width: 200, height: 200 }}
            />
          )}
          {bookingResult.email?.sent && !bookingResult.email?.usingTestInbox && (
            <p>Confirmation email with QR ticket sent to <strong>{bookingResult.email.sentTo}</strong>. Check spam/promotions if you do not see it.</p>
          )}
          {bookingResult.email?.sent && bookingResult.email?.previewUrl && (
            <p>
              Test SMTP captured the email (Ethereal does not deliver to real inboxes).{' '}
              <a href={bookingResult.email.previewUrl} target="_blank" rel="noreferrer">
                View test email and QR
              </a>
            </p>
          )}
          {!bookingResult.email?.sent && (
            <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
              Email not sent: {bookingResult.email?.error || 'Unknown error'}. Save the QR code above for venue entry.
            </div>
          )}
        </div>
      )}

      {seatData && !soldOut && (
        <>
          <div className="legend">
            {event.pricing.map((p) => (
              <div key={p.category_id} className="legend-item">
                <div className="legend-swatch" style={{ background: p.color }} />
                {p.category_name} - ${p.price}
              </div>
            ))}
            <div className="legend-item"><div className="legend-swatch" style={{ background: '#f59e0b' }} /> Held</div>
            <div className="legend-item"><div className="legend-swatch" style={{ background: '#9ca3af' }} /> Booked</div>
          </div>

          <div className="card">
            <SeatMap
              seats={seatData.seats}
              rows={seatData.rows}
              cols={seatData.cols}
              selected={selected}
              onToggle={toggleSeat}
              userId={user?.id}
            />
          </div>

          {user?.role === 'customer' && (
            <div className="checkout-bar">
              <div>
                {selected.length > 0 && <span>{selected.length} seat(s) selected</span>}
                {holdExpires && <span style={{ marginLeft: '1rem', color: '#f59e0b' }}>
                  Hold expires: {new Date(holdExpires).toLocaleTimeString()}
                </span>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={handleHold} disabled={loading || selected.length === 0}>
                  Hold Seats
                </button>
                <button className="btn btn-primary" onClick={handleConfirm} disabled={loading || (selected.length === 0 && heldSeats.length === 0)}>
                  Confirm Booking
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {soldOut && (
        <div className="card">
          <h3>Sold Out</h3>
          <p>This event is fully booked. Join the waitlist for a seat category:</p>
          {categories.map((cat) => (
            <button
              key={cat.category_id}
              className="btn btn-primary btn-sm"
              style={{ marginRight: '0.5rem', marginTop: '0.5rem' }}
              onClick={() => handleJoinWaitlist(cat.category_id)}
            >
              Join {cat.category_name} Waitlist (${cat.price})
            </button>
          ))}
        </div>
      )}

      {waitlistEntries.length > 0 && (
        <div className="card">
          <h3>Your Waitlist Status</h3>
          <table>
            <thead><tr><th>Category</th><th>Position</th><th>Status</th></tr></thead>
            <tbody>
              {waitlistEntries.map((w) => (
                <tr key={w.id}>
                  <td>{w.category_name}</td>
                  <td>#{w.position}</td>
                  <td>{w.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
