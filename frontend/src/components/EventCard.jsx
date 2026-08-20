import { Link } from 'react-router-dom';

export default function EventCard({ event }) {
  const soldOut = event.available_seats === 0;
  return (
    <div className="card event-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <h3>{event.title}</h3>
        <span className={`badge badge-${event.type}`}>{event.type}</span>
      </div>
      <div className="meta">
        <div>{event.venue_name}</div>
        <div>{event.event_date} at {event.event_time}</div>
        <div>{event.available_seats} / {event.total_seats} seats available</div>
      </div>
      <div className="price">From ${event.min_price?.toFixed(2)}</div>
      <div style={{ marginTop: '1rem' }}>
        <Link to={`/events/${event.id}`} className="btn btn-primary btn-sm">
          {soldOut ? 'View & Join Waitlist' : 'Book Now'}
        </Link>
      </div>
    </div>
  );
}
