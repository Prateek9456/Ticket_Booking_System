import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function WaitlistOffer() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    api.getWaitlistOffer(token)
      .then(setOffer)
      .catch((err) => setError(err.message));
  }, [token, user, navigate]);

  async function handleAccept() {
    try {
      const result = await api.acceptWaitlistOffer(token);
      setMessage('Seat held! Complete your booking now.');
      const booking = await api.confirmBooking(result.eventId, result.seatIds);
      setMessage(`Booking confirmed! Reference: ${booking.bookingRef}`);
      setTimeout(() => navigate('/bookings'), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="container"><div className="alert alert-error">{error}</div></div>;
  if (!offer) return <div className="container"><p>Loading offer...</p></div>;

  return (
    <div className="container" style={{ maxWidth: 500, marginTop: '3rem' }}>
      <div className="card">
        <h2>Waitlist Offer</h2>
        <p>A <strong>{offer.category_name}</strong> seat is available for <strong>{offer.title}</strong>.</p>
        <p>{offer.event_date} at {offer.event_time}</p>
        <p>Offer expires: <strong>{new Date(offer.offer_expires_at).toLocaleString()}</strong></p>
        {message && <div className="alert alert-success">{message}</div>}
        <button className="btn btn-primary" onClick={handleAccept} style={{ width: '100%', marginTop: '1rem' }}>
          Accept & Book Now
        </button>
      </div>
    </div>
  );
}
