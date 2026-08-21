import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [qrCodes, setQrCodes] = useState({});
  const [emailLinks, setEmailLinks] = useState({});

  const load = () => api.getMyBookings().then(setBookings).catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  async function showQr(id) {
    try {
      const data = await api.getBookingQr(id);
      setQrCodes((prev) => ({ ...prev, [id]: data.qrCode }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function resendEmail(id) {
    setError('');
    setMessage('');
    try {
      const result = await api.resendBookingEmail(id);
      if (result.previewUrl) {
        setEmailLinks((prev) => ({ ...prev, [id]: result.previewUrl }));
        setMessage(`Test email captured for ${result.sentTo}. Open the Ethereal link below.`);
      } else {
        setMessage(`Email sent to ${result.sentTo}. Check your inbox (and spam folder).`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const isDemoEmail = user?.email?.endsWith('@demo.com');

  async function handleCancel(id) {
    if (!confirm('Cancel this booking?')) return;
    try {
      const result = await api.cancelBooking(id);
      setMessage(
        result.email?.sent
          ? `${result.message}. Cancellation email sent to ${result.email.sentTo}.`
          : result.message
      );
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">My Bookings</h1>
      {user?.email && (
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Booking emails are sent to <strong>{user.email}</strong>
        </p>
      )}
      {isDemoEmail && (
        <div className="alert alert-error">
          You are logged in with a demo email ({user.email}). Resend cannot deliver to fake addresses.
          Register a new account with the same email you used on resend.com.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {bookings.length === 0 ? (
        <p>No bookings yet.</p>
      ) : (
        <>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            Showing {bookings.length} booking{bookings.length !== 1 ? 's' : ''} ({bookings.filter((b) => b.status === 'confirmed').length} active, {bookings.filter((b) => b.status === 'cancelled').length} cancelled)
          </p>
          {bookings.map((b) => (
          <div key={b.id} className={`card ${b.status === 'cancelled' ? 'card-cancelled' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h3>{b.title}</h3>
                <p style={{ color: '#6b7280' }}>{b.venue_name} &middot; {b.event_date} at {b.event_time}</p>
                <p>Ref: <strong>{b.booking_ref}</strong> &middot; ${b.total_amount.toFixed(2)}</p>
                <p>Seats: {b.seats.map((s) => `R${s.row_num}C${s.col_num} (${s.category_name})`).join(', ')}</p>
                {b.status === 'cancelled' && (
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    This booking was cancelled. Seats have been released.
                  </p>
                )}
                {qrCodes[b.id] && (
                  <img
                    src={qrCodes[b.id]}
                    alt={`QR code for ${b.booking_ref}`}
                    style={{ display: 'block', marginTop: '1rem', width: 160, height: 160 }}
                  />
                )}
                {emailLinks[b.id] && (
                  <p style={{ marginTop: '0.75rem' }}>
                    <a href={emailLinks[b.id]} target="_blank" rel="noreferrer">
                      View email in Ethereal mailbox
                    </a>
                  </p>
                )}
              </div>
              <div>
                <span className={`badge badge-${b.status}`}>{b.status}</span>
                {b.status === 'confirmed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => showQr(b.id)}>
                      Show QR
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => resendEmail(b.id)}>
                      Resend Email
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleCancel(b.id)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          ))}
        </>
      )}
    </div>
  );
}
