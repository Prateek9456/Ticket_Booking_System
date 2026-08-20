import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="container">
        <Link to="/" className="brand">TicketBook</Link>
        <div className="links">
          <Link to="/">Events</Link>
          {user ? (
            <>
              {user.role === 'customer' && <Link to="/bookings">My Bookings</Link>}
              {user.role === 'organiser' && <Link to="/organiser">Dashboard</Link>}
              {user.role === 'admin' && <Link to="/admin">Admin</Link>}
              <span className="user">{user.name} ({user.role})</span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
