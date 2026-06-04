export default function ConnectionBadge({ connected }) {
  return (
    <span className={`connection-badge ${connected ? 'connected' : 'disconnected'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: connected ? '#138a45' : 'var(--amber)',
        animation: connected ? 'pulseRing 1.5s infinite' : 'none'
      }}></span>
      {connected ? 'System Online' : 'System Offline'}
    </span>
  );
}
