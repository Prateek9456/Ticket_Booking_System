import { useState, useEffect } from 'react';
import { api } from '../api';

export default function AdminVenues() {
  const [venues, setVenues] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', rows: 8, cols: 10,
    categories: [
      { name: 'Premium', color: '#FFD700', rowStart: 1, rowEnd: 2 },
      { name: 'Standard', color: '#4CAF50', rowStart: 3, rowEnd: 5 },
      { name: 'Economy', color: '#2196F3', rowStart: 6, rowEnd: 8 },
    ],
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => api.getVenues().then(setVenues).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.createVenue(form);
      setMessage('Venue created successfully');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Admin - Venue Management</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ marginBottom: '1rem' }}>
        {showForm ? 'Cancel' : 'Create Venue'}
      </button>

      {showForm && (
        <div className="card">
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Venue Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Rows</label>
                <input type="number" value={form.rows} onChange={(e) => setForm({ ...form, rows: Number(e.target.value) })} min={1} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Columns</label>
                <input type="number" value={form.cols} onChange={(e) => setForm({ ...form, cols: Number(e.target.value) })} min={1} />
              </div>
            </div>
            <h4 style={{ marginBottom: '0.5rem' }}>Seat Categories</h4>
            {form.categories.map((cat, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input placeholder="Name" value={cat.name} onChange={(e) => {
                  const cats = [...form.categories];
                  cats[i].name = e.target.value;
                  setForm({ ...form, categories: cats });
                }} />
                <input type="color" value={cat.color} onChange={(e) => {
                  const cats = [...form.categories];
                  cats[i].color = e.target.value;
                  setForm({ ...form, categories: cats });
                }} />
                <input type="number" placeholder="Row start" value={cat.rowStart} onChange={(e) => {
                  const cats = [...form.categories];
                  cats[i].rowStart = Number(e.target.value);
                  setForm({ ...form, categories: cats });
                }} style={{ width: 80 }} />
                <input type="number" placeholder="Row end" value={cat.rowEnd} onChange={(e) => {
                  const cats = [...form.categories];
                  cats[i].rowEnd = Number(e.target.value);
                  setForm({ ...form, categories: cats });
                }} style={{ width: 80 }} />
              </div>
            ))}
            <button type="submit" className="btn btn-primary">Create Venue</button>
          </form>
        </div>
      )}

      <div className="grid grid-2">
        {venues.map((v) => (
          <div key={v.id} className="card">
            <h3>{v.name}</h3>
            <p>{v.rows} rows &times; {v.cols} columns</p>
          </div>
        ))}
      </div>
    </div>
  );
}
