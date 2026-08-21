import { useState, useEffect } from 'react';
import { api } from '../api';

export default function OrganiserDashboard() {
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', type: 'movie', venueId: '', eventDate: '', eventTime: '', description: '', pricing: [],
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getOrganiserEvents().then(setEvents).catch((err) => setError(err.message));
    api.getOrganiserVenues().then(setVenues).catch(() => {});
  }, []);

  function handleVenueChange(venueId) {
    const venue = venues.find((v) => v.id === Number(venueId));
    setForm({
      ...form,
      venueId,
      pricing: venue ? venue.categories.map((c) => ({ categoryId: c.id, price: 0 })) : [],
    });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await api.createEvent({
        ...form,
        venueId: Number(form.venueId),
        pricing: form.pricing.map((p) => ({ categoryId: p.categoryId, price: Number(p.price) })),
      });
      setMessage(
        result.email?.sent
          ? `Event created. Confirmation email sent to ${result.email.sentTo}.`
          : 'Event created'
      );
      setShowForm(false);
      api.getOrganiserEvents().then(setEvents);
    } catch (err) {
      setError(err.message);
    }
  }

  async function viewSummary(eventId) {
    try {
      const data = await api.getEventSummary(eventId);
      setSummary(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(event) {
    if (event.booking_count > 0) {
      setError('Cannot delete an event with confirmed bookings');
      return;
    }
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return;

    setError('');
    try {
      const result = await api.deleteEvent(event.id);
      setMessage(
        result.email?.sent
          ? `Event deleted. Confirmation email sent to ${result.email.sentTo}.`
          : 'Event deleted'
      );
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      if (summary?.event?.id === event.id) setSummary(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const venue = venues.find((v) => v.id === Number(form.venueId));

  return (
    <div className="container">
      <h1 className="page-title">Organiser Dashboard</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ marginBottom: '1rem' }}>
        {showForm ? 'Cancel' : 'Create Event'}
      </button>

      {showForm && (
        <div className="card">
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="movie">Movie</option>
                <option value="concert">Concert</option>
              </select>
            </div>
            <div className="form-group">
              <label>Venue</label>
              <select value={form.venueId} onChange={(e) => handleVenueChange(e.target.value)} required>
                <option value="">Select venue</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Date</label>
                <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} required />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Time</label>
                <input type="time" value={form.eventTime} onChange={(e) => setForm({ ...form, eventTime: e.target.value })} required />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            {venue && (
              <div>
                <h4>Pricing</h4>
                {form.pricing.map((p, i) => {
                  const cat = venue.categories.find((c) => c.id === p.categoryId);
                  return (
                    <div key={p.categoryId} className="form-group">
                      <label>{cat?.name}</label>
                      <input type="number" step="0.01" value={p.price}
                        onChange={(e) => {
                          const pricing = [...form.pricing];
                          pricing[i].price = e.target.value;
                          setForm({ ...form, pricing });
                        }} required />
                    </div>
                  );
                })}
              </div>
            )}
            <button type="submit" className="btn btn-primary">Create Event</button>
          </form>
        </div>
      )}

      <h2 style={{ marginBottom: '1rem' }}>Your Events</h2>
      <table>
        <thead>
          <tr><th>Title</th><th>Date</th><th>Venue</th><th>Bookings</th><th>Revenue</th><th></th></tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.title} <span className={`badge badge-${e.type}`}>{e.type}</span></td>
              <td>{e.event_date} {e.event_time}</td>
              <td>{e.venue_name}</td>
              <td>{e.booking_count}</td>
              <td>${e.revenue?.toFixed(2)}</td>
              <td>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => viewSummary(e.id)}>Summary</button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(e)}
                    disabled={e.booking_count > 0}
                    title={e.booking_count > 0 ? 'Cannot delete events with confirmed bookings' : 'Delete event'}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {summary && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>{summary.event.title} - Booking Summary</h3>
          <div className="stats-grid">
            <div className="stat-card"><div className="value">${summary.revenue.toFixed(2)}</div><div className="label">Revenue</div></div>
            <div className="stat-card"><div className="value">{summary.totalBookings}</div><div className="label">Bookings</div></div>
            {summary.seatStats.map((s) => (
              <div key={s.status} className="stat-card">
                <div className="value">{s.count}</div>
                <div className="label">{s.status} seats</div>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setSummary(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
