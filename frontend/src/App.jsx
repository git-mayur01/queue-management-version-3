import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { api } from './services/api.js';
import { supabase } from './lib/supabase.js';

export default function App() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // User state
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Synchronize currentUser with Supabase auth state to prevent navbar being hidden on reload / new tab
  useEffect(() => {
    let isMounted = true;
    
    async function syncAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !session.user) {
          if (isMounted) {
            setCurrentUser(null);
            sessionStorage.removeItem('user');
          }
          return;
        }

        // Fetch user profile from database
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile && isMounted) {
          const user = {
            id: profile.id,
            name: profile.name,
            username: session.user.email.split('@')[0],
            role: profile.role
          };
          setCurrentUser(user);
          sessionStorage.setItem('user', JSON.stringify(user));
        }
      } catch (err) {
        console.error('App auth sync error:', err);
      }
    }

    syncAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      if (session && session.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile && isMounted) {
            const user = {
              id: profile.id,
              name: profile.name,
              username: session.user.email.split('@')[0],
              role: profile.role
            };
            setCurrentUser(user);
            sessionStorage.setItem('user', JSON.stringify(user));
          }
        } catch (err) {
          console.error('App auth change error:', err);
        }
      } else {
        if (isMounted) {
          setCurrentUser(null);
          sessionStorage.removeItem('user');
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Factory Reset and notification states
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState(null);

  // Hide nav on the welcome/login page or customer display screen
  const shouldHideNav = location.pathname === '/' || location.pathname === '/display';

  // Check for successful reset message across reloads
  useEffect(() => {
    if (localStorage.getItem('resetSuccess') === 'true') {
      localStorage.removeItem('resetSuccess');
      setToast('✨ Factory Reset Completed Successfully. The system is now in a fresh installation state.');
    }
  }, []);

  // Bulletproof auto-dismissal for toasts
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Close menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
    setCurrentUser(null);
    window.location.href = '/';
  };

  const handleFactoryReset = async (e) => {
    e.preventDefault();
    if (!confirmPassword) {
      setResetError('Admin password is required to confirm factory reset.');
      return;
    }

    setResetting(true);
    setResetError(null);
    try {
      const res = await api.factoryReset(confirmPassword);
      if (res && res.success) {
        setShowResetConfirm(false);
        setConfirmPassword('');
        // Clear session on factory reset
        sessionStorage.removeItem('user');
        localStorage.setItem('resetSuccess', 'true');
        // Redirect to welcome and fully reload
        window.location.href = '/';
      } else {
        setResetError('❌ Failed to complete factory reset.');
      }
    } catch (err) {
      setResetError(`❌ Error: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  // Build navItems based on logged-in user's role
  const navItems = [];
  if (currentUser) {
    if (currentUser.role === 'admin') {
      navItems.push({ to: '/admin', label: 'Admin Dashboard' });
      navItems.push({ to: '/user-management', label: 'User Management' });
      navItems.push({ to: '/menu', label: 'Menu Manager' });
    } else if (currentUser.role === 'cashier') {
      navItems.push({ to: '/cashier', label: 'Cashier' });
    } else if (currentUser.role === 'kitchen') {
      navItems.push({ to: '/kitchen', label: 'Kitchen' });
    } else if (currentUser.role === 'display') {
      navItems.push({ to: '/display', label: 'Display' });
    }
  }

  return (
    <div className="app-shell">
      {/* Toast Alert */}
      {toast && (
        <div className="cashier-toast" style={{ background: 'var(--green)', color: 'white', borderLeft: '5px solid #0d5f30', zIndex: 99999 }}>
          <span className="toast-icon">✓</span>
          <strong>{toast}</strong>
        </div>
      )}

      {!shouldHideNav && currentUser && (
        <nav className="top-nav" aria-label="Primary navigation">
          <div className="brand">
            {(() => {
              const path = location.pathname;
              if (path === '/kitchen') return 'Kitchen';
              if (path === '/cashier') return 'Cashier';
              if (path === '/admin') return 'Admin';
              if (path === '/user-management') return 'Users';
              if (path === '/menu') return 'Menu';
              return 'Local Orders';
            })()}
          </div>

          <div className="compact-online-indicator">
            Online <span className="indicator-dot">●</span>
          </div>

          {/* Hamburger toggle */}
          <div className="hamburger-wrapper" ref={menuRef}>
            <button
              className={`hamburger-btn ${menuOpen ? 'open' : ''}`}
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <span className="hamburger-line" />
              <span className="hamburger-line" />
              <span className="hamburger-line" />
            </button>

            {/* Dropdown submenu */}
            {menuOpen && (
              <div className="nav-dropdown" role="menu">
                {navItems.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    role="menuitem"
                    className={({ isActive }) =>
                      `nav-dropdown-item${isActive ? ' active' : ''}`
                    }
                    onClick={() => setMenuOpen(false)}
                  >
                    {label}
                  </NavLink>
                ))}

                <div className="nav-dropdown-divider" />

                {/* Factory Reset - Admin only */}
                {currentUser.role === 'admin' && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="nav-dropdown-item danger"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowResetConfirm(true);
                        setConfirmPassword('');
                        setResetError(null);
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      ⚠️ Factory Reset
                    </button>
                    <div className="nav-dropdown-divider" />
                  </>
                )}

                {/* Logout Button */}
                <button
                  type="button"
                  role="menuitem"
                  className="nav-dropdown-item"
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </nav>
      )}

      <Outlet />

      {/* Global Factory Reset Confirmation Modal with Password verification */}
      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)} style={{ zIndex: 11000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <header className="modal-header" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem' }}>
              <h2 style={{ color: 'var(--primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⚠️ Factory Reset</h2>
              <button className="btn-close-modal" onClick={() => setShowResetConfirm(false)}>×</button>
            </header>
            <form onSubmit={handleFactoryReset}>
              <div className="modal-body" style={{ padding: '1.5rem 0' }}>
                <p style={{ fontWeight: 800, color: 'var(--ink)', fontSize: '1rem', margin: '0 0 1rem 0' }}>
                  This will permanently remove all business data and return the application to a fresh installation state.
                </p>
                <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', padding: '1rem', borderRadius: '0.75rem', color: 'var(--primary)', fontWeight: 800, fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  <strong>This action cannot be undone.</strong> All orders, menu items, price availability states, generated stats, and counters will be completely wiped out.
                </div>

                {resetError && (
                  <div style={{ color: 'var(--primary)', background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                    {resetError}
                  </div>
                )}

                <div className="welcome-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label htmlFor="confirm-password-input" style={{ fontWeight: 'bold', color: 'var(--ink)' }}>Confirm Admin Password</label>
                  <input
                    id="confirm-password-input"
                    type="password"
                    placeholder="Enter current admin password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={resetting}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--line)',
                      fontSize: '1rem',
                    }}
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <footer className="modal-footer" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetting}
                  style={{ width: 'auto', padding: '0.6rem 1.5rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-action btn-confirm-add"
                  disabled={resetting}
                  style={{ background: 'var(--primary)', borderColor: 'var(--primary)', width: 'auto', padding: '0.6rem 1.5rem', marginTop: 0, cursor: 'pointer' }}
                >
                  {resetting ? 'Resetting...' : 'Factory Reset'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
