import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  const [emailRegistered, setEmailRegistered] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEmailRegistered(false);
    try {
      const user = await register(form);
      if (user.role === 'organiser') navigate('/organiser');
      else navigate('/');
    } catch (err) {
      setError(err.message);
      if (err.data?.emailRegistered) {
        setEmailRegistered(true);
      }
    }
  };

  return (
    <div className="container auth-page">
      <div className="card">
        <h2 className="page-title">Register</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {emailRegistered && (
          <div className="alert alert-info">
            Already have an account? <Link to="/login">Log in</Link> or{' '}
            <Link to={`/forgot-password?email=${encodeURIComponent(form.email)}`}>reset your password</Link>.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Register as</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="customer">Customer</option>
              <option value="organiser">Organiser</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Register</button>
        </form>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
