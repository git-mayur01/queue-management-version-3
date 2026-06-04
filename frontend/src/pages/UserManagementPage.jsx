import { useState, useEffect, useRef } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../services/api.js';

export default function UserManagementPage() {
  const isMounted = useRef(true);
  const activeTimers = useRef([]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      activeTimers.current.forEach(clearTimeout);
    };
  }, []);


  const [cashierUser, setCashierUser] = useState('');
  const [cashierPass, setCashierPass] = useState('');
  const [showCashierPass, setShowCashierPass] = useState(false);

  const [kitchenUser, setKitchenUser] = useState('');
  const [kitchenPass, setKitchenPass] = useState('');
  const [showKitchenPass, setShowKitchenPass] = useState(false);

  const [displayUser, setDisplayUser] = useState('');
  const [displayPass, setDisplayPass] = useState('');
  const [showDisplayPass, setShowDisplayPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUsers();
      if (isMounted.current && data) {
        if (data.cashier) setCashierUser(data.cashier.username || '');
        if (data.kitchen) setKitchenUser(data.kitchen.username || '');
        if (data.display) setDisplayUser(data.display.username || '');
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message || 'Failed to retrieve role accounts.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setToast(null);

    if (!cashierUser.trim() || !kitchenUser.trim() || !displayUser.trim()) {
      setError('Usernames cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        cashier: { username: cashierUser.trim(), password: cashierPass },
        kitchen: { username: kitchenUser.trim(), password: kitchenPass },
        display: { username: displayUser.trim(), password: displayPass }
      };

      await api.saveUsers(payload);
      
      if (isMounted.current) {
        // Clear password fields on successful save
        setCashierPass('');
        setKitchenPass('');
        setDisplayPass('');

        setToast('✨ Role credentials successfully updated and securely persisted!');
        const timer = setTimeout(() => {
          if (isMounted.current) {
            setToast(null);
          }
        }, 3000);
        activeTimers.current.push(timer);

      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message || 'Failed to update credentials.');
      }
    } finally {
      if (isMounted.current) {
        setSaving(false);
      }
    }
  };

  return (
    <main className="page user-management-page">
      {/* Toast Alert */}
      {toast && (
        <div className="cashier-toast" style={{ background: 'var(--green)', color: 'white', borderLeft: '5px solid #0d5f30', zIndex: 9999 }}>
          <span className="toast-icon">✓</span>
          <strong>{toast}</strong>
        </div>
      )}

      <PageHeader title="User Management" connected={true} />

      <section className="panel" style={{ maxWidth: '650px', margin: '2rem auto', padding: '2rem', background: '#ffffff', border: '1px solid var(--line)', borderRadius: '1.5rem' }}>
        <header style={{ borderBottom: '1px solid var(--line)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary-dark)', margin: 0 }}>Configure Role Credentials</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 700 }}>
            Modify usernames and passwords for fixed device roles. Leave password fields blank to retain current passwords.
          </p>
        </header>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="pos-spinner" style={{ border: '4px solid var(--line)', borderTop: '4px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px', margin: '0 auto', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ marginTop: '1rem', fontWeight: 'bold', color: 'var(--muted)' }}>Retrieving configuration...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="user-management-form">
            {error && (
              <div className="user-management-error-banner">
                ⚠️ {error}
              </div>
            )}

            {/* Cashier Configuration */}
            <div className="role-config-card">
              <h3 className="role-card-title">Cashier Role</h3>
              
              <div className="role-card-field">
                <label htmlFor="cashier-username">Username</label>
                <input
                  id="cashier-username"
                  type="text"
                  placeholder="Enter cashier username"
                  value={cashierUser}
                  onChange={(e) => setCashierUser(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="role-card-field">
                <label htmlFor="cashier-password">Password</label>
                <div className="password-input-wrapper">
                  <input
                    id="cashier-password"
                    type={showCashierPass ? "text" : "password"}
                    placeholder="Password"
                    value={cashierPass}
                    onChange={(e) => setCashierPass(e.target.value)}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowCashierPass(!showCashierPass)}
                    aria-label={showCashierPass ? "Hide password" : "Show password"}
                  >
                    {showCashierPass ? (
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
            </div>

            {/* Kitchen Configuration */}
            <div className="role-config-card">
              <h3 className="role-card-title">Kitchen Role</h3>
              
              <div className="role-card-field">
                <label htmlFor="kitchen-username">Username</label>
                <input
                  id="kitchen-username"
                  type="text"
                  placeholder="Enter kitchen username"
                  value={kitchenUser}
                  onChange={(e) => setKitchenUser(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="role-card-field">
                <label htmlFor="kitchen-password">Password</label>
                <div className="password-input-wrapper">
                  <input
                    id="kitchen-password"
                    type={showKitchenPass ? "text" : "password"}
                    placeholder="Password"
                    value={kitchenPass}
                    onChange={(e) => setKitchenPass(e.target.value)}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowKitchenPass(!showKitchenPass)}
                    aria-label={showKitchenPass ? "Hide password" : "Show password"}
                  >
                    {showKitchenPass ? (
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
            </div>

            {/* Display Configuration */}
            <div className="role-config-card">
              <h3 className="role-card-title">Display Role</h3>
              
              <div className="role-card-field">
                <label htmlFor="display-username">Username</label>
                <input
                  id="display-username"
                  type="text"
                  placeholder="Enter display username"
                  value={displayUser}
                  onChange={(e) => setDisplayUser(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="role-card-field">
                <label htmlFor="display-password">Password</label>
                <div className="password-input-wrapper">
                  <input
                    id="display-password"
                    type={showDisplayPass ? "text" : "password"}
                    placeholder="Password"
                    value={displayPass}
                    onChange={(e) => setDisplayPass(e.target.value)}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowDisplayPass(!showDisplayPass)}
                    aria-label={showDisplayPass ? "Hide password" : "Show password"}
                  >
                    {showDisplayPass ? (
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
            </div>

            <footer className="user-management-footer">
              <button
                type="submit"
                className="user-management-save-btn"
                disabled={saving}
              >
                {saving ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </main>
  );
}
