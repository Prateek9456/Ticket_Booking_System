import { useState, useEffect } from 'react';
import { api } from '../api';
import EventCard from '../components/EventCard';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState({ type: '', search: '', date: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    const params = {};
    if (filters.type) params.type = filters.type;
    if (filters.search) params.search = filters.search;
    if (filters.date) params.date = filters.date;

    api.getEvents(params)
      .then(setEvents)
      .catch((err) => setError(err.message));
  }, [filters]);

  return (
    <div className="container">
      <h1 className="page-title">Browse Events</h1>
      <div className="filters">
        <input
          placeholder="Search events..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All Types</option>
          <option value="movie">Movies</option>
          <option value="concert">Concerts</option>
        </select>
        <input
          type="date"
          value={filters.date}
          onChange={(e) => setFilters({ ...filters, date: e.target.value })}
        />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="grid grid-2">
        {events.map((e) => <EventCard key={e.id} event={e} />)}
      </div>
      {events.length === 0 && !error && <p>No events found.</p>}
    </div>
  );
}
