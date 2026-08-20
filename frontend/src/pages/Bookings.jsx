import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => api.getMyBookings().then(setBookings).catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  async function handleCancel(id) {
    if (!confirm('Cancel this booking?')) return;
    try {
      const result = await api.cancelBooking(id);
      setMessage(result.message);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">My Bookings</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {bookings.length === 0 ? (
        <p>No bookings yet.</p>
      ) : (
        bookings.map((b) => (
          <div key={b.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h3>{b.title}</h3>
                <p style={{ color: '#6b7280' }}>{b.venue_name} &middot; {b.event_date} at {b.event_time}</p>
                <p>Ref: <strong>{b.booking_ref}</strong> &middot; ${b.total_amount.toFixed(2)}</p>
                <p>Seats: {b.seats.map((s) => `R${s.row_num}C${s.col_num} (${s.category_name})`).join(', ')}</p>
              </div>
              <div>
                <span className={`badge badge-${b.status}`}>{b.status}</span>
                {b.status === 'confirmed' && (
                  <button className="btn btn-danger btn-sm" style={{ display: 'block', marginTop: '0.5rem' }} onClick={() => handleCancel(b.id)}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
