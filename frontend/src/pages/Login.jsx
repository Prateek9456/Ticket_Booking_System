import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'organiser') navigate('/organiser');
      else navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container auth-page">
      <div className="card">
        <h2 className="page-title">Login</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Login</button>
        </form>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          No account? <Link to="/register">Register</Link>
        </p>
        <div className="alert alert-info" style={{ marginTop: '1rem' }}>
          Demo: customer@demo.com / customer123 | organiser@demo.com / organiser123 | admin@ticketbooking.com / admin123
        </div>
      </div>
    </div>
  );
}
