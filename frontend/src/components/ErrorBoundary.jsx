import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log the error securely
    console.error('POS Application Crash Protected:', error, errorInfo);
  }

  handleReset = () => {
    sessionStorage.removeItem('user'); // reset session to resolve potential corrupted session data
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="access-denied-container" style={{ background: 'radial-gradient(circle at 10% 20%, #fbf8f3 0%, #eae3d2 90.1%)' }}>
          <div className="access-denied-card" style={{ background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(192, 57, 43, 0.2)', boxShadow: '0 30px 60px rgba(70, 45, 20, 0.12)' }}>
            <div className="access-denied-icon" style={{ fontSize: '4rem', animation: 'none' }}>⚠️</div>
            <h1 style={{ color: 'var(--primary-dark)', fontSize: '2rem', fontWeight: 900 }}>Application Recovered</h1>
            <p style={{ color: 'var(--muted)', fontWeight: 700, fontSize: '0.95rem', margin: '0.25rem 0 1rem 0' }}>
              The system encountered a minor runtime interruption and has protected your transaction queue from crashing.
            </p>
            
            <div style={{ background: '#fdfaf6', border: '1px solid var(--line)', padding: '1rem', borderRadius: '1rem', width: '100%', textAlign: 'left', maxHeight: '150px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              <strong style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Interruption Details</strong>
              <code style={{ fontSize: '0.85rem', color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 'bold', wordBreak: 'break-all' }}>
                {this.state.error?.toString() || 'Unknown runtime error'}
              </code>
            </div>

            <button
              onClick={this.handleReset}
              className="user-management-save-btn"
              style={{ height: '48px', marginTop: 0 }}
            >
              🔄 Safe Restart POS
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
