const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),

  getEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ''}`);
  },
  getEvent: (id) => request(`/events/${id}`),
  getSeatMap: (eventId) => request(`/seats/${eventId}/map`),
  holdSeats: (eventId, seatIds) =>
    request(`/seats/${eventId}/hold`, { method: 'POST', body: JSON.stringify({ seatIds }) }),
  releaseSeats: (eventId, seatIds) =>
    request(`/seats/${eventId}/release`, { method: 'POST', body: JSON.stringify({ seatIds }) }),

  confirmBooking: (eventId, seatIds) =>
    request('/bookings/confirm', { method: 'POST', body: JSON.stringify({ eventId, seatIds }) }),
  getMyBookings: () => request('/bookings/my'),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'POST' }),

  joinWaitlist: (eventId, categoryId) =>
    request(`/waitlist/${eventId}/join`, { method: 'POST', body: JSON.stringify({ categoryId }) }),
  getMyWaitlist: (eventId) => request(`/waitlist/${eventId}/my`),
  getWaitlistOffer: (token) => request(`/waitlist/offer/${token}`),
  acceptWaitlistOffer: (token) => request(`/waitlist/offer/${token}/accept`, { method: 'POST' }),

  getVenues: () => request('/admin/venues'),
  createVenue: (body) => request('/admin/venues', { method: 'POST', body: JSON.stringify(body) }),
  getVenue: (id) => request(`/admin/venues/${id}`),

  getOrganiserVenues: () => request('/organiser/venues'),
  createEvent: (body) => request('/organiser/events', { method: 'POST', body: JSON.stringify(body) }),
  getOrganiserEvents: () => request('/organiser/events'),
  getEventSummary: (id) => request(`/organiser/events/${id}/summary`),
  deleteEvent: (id) => request(`/organiser/events/${id}`, { method: 'DELETE' }),
};
