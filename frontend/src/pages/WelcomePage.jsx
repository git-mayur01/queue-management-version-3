import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function WelcomePage() {
  const navigate = useNavigate();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [role, setRole] = useState('Admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Persistent login: if already logged in, redirect immediately on next visit
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user && user.role) {
          let path = '/';
          if (user.role === 'admin') path = '/admin';
          else if (user.role === 'cashier') path = '/cashier';
          else if (user.role === 'kitchen') path = '/kitchen';
          else if (user.role === 'display') path = '/display';
          if (isMounted.current) {
            navigate(path, { replace: true });
          }
        }
      }
    } catch (e) {
      console.error('Error reading session:', e);
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isMounted.current) {
      setError(null);
    }

    if (!username.trim() || !password) {
      if (isMounted.current) {
        setError('Please enter both username and password.');
      }
      return;
    }

    if (isMounted.current) {
      setLoading(true);
    }
    try {
      const res = await api.login(role, username.trim(), password);
      if (res && res.success && res.user && res.token) {
        // Store session locally
        sessionStorage.setItem('user', JSON.stringify(res.user));
        sessionStorage.setItem('token', res.token);

        // Redirect based on role
        let path = '/';
        const userRole = res.user.role;
        if (userRole === 'admin') path = '/admin';
        else if (userRole === 'cashier') path = '/cashier';
        else if (userRole === 'kitchen') path = '/kitchen';
        else if (userRole === 'display') path = '/display';

        if (isMounted.current) {
          navigate(path, { replace: true });
          window.location.reload();
        }
      } else {
        if (isMounted.current) {
          setError('Invalid credentials.');
        }
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="welcome-page-container">
      <div className="welcome-card-wrapper">
        <div className="welcome-card-header">
          <div className="welcome-logo">🍽️</div>
          <h1 className="welcome-title">Local Orders</h1>
          <p className="welcome-subtitle">Restaurant Device Configuration</p>
        </div>

        <form onSubmit={handleSubmit} className="welcome-form">
          {error && (
            <div className="welcome-error-banner">
              <span className="error-icon">⚠️</span>
              <p>{error}</p>
            </div>
          )}

          <div className="welcome-form-group">
            <label htmlFor="role-select">Role</label>
            <div className="select-wrapper">
              <select
                id="role-select"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={loading}
              >
                <option value="Admin">Admin</option>
                <option value="Cashier">Cashier</option>
                <option value="Kitchen">Kitchen</option>
                <option value="Display">Display</option>
              </select>
              <div className="select-arrow"></div>
            </div>
          </div>

          <div className="welcome-form-group">
            <label htmlFor="username-input">Username</label>
            <input
              id="username-input"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="welcome-form-group">
            <label htmlFor="password-input">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password-input"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="welcome-login-btn" disabled={loading}>
            {loading ? (
              <span className="login-spinner"></span>
            ) : (
              'Login'
            )}
          </button>
        </form>

        <div className="welcome-footer">
          <p>Please enter your assigned role credentials to configure this device.</p>
        </div>
      </div>
    </div>
  );
}
