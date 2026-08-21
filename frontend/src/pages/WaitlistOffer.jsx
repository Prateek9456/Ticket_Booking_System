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
  const [bookingResult, setBookingResult] = useState(null);

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
      setBookingResult(booking);
      setMessage(`Booking confirmed! Reference: ${booking.bookingRef}`);
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
        {bookingResult && (
          <div style={{ marginTop: '1rem' }}>
            {bookingResult.qrCode && (
              <img
                src={bookingResult.qrCode}
                alt={`QR code for booking ${bookingResult.bookingRef}`}
                style={{ display: 'block', margin: '0 auto 1rem', width: 200, height: 200 }}
              />
            )}
            {bookingResult.email?.previewUrl && (
              <p style={{ textAlign: 'center' }}>
                <a href={bookingResult.email.previewUrl} target="_blank" rel="noreferrer">
                  View test email
                </a>
              </p>
            )}
            {!bookingResult.email?.sent && (
              <div className="alert alert-error">
                Email not sent: {bookingResult.email?.error || 'Unknown error'}
              </div>
            )}
            <button className="btn btn-secondary" onClick={() => navigate('/bookings')} style={{ width: '100%', marginTop: '0.5rem' }}>
              View My Bookings
            </button>
          </div>
        )}
        {!bookingResult && (
          <button className="btn btn-primary" onClick={handleAccept} style={{ width: '100%', marginTop: '1rem' }}>
            Accept & Book Now
          </button>
        )}
      </div>
    </div>
  );
}
