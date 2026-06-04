import { useEffect, useState, useRef } from 'react';
import ConnectionBadge from '../components/ConnectionBadge.jsx';
import { api } from '../services/api.js';
import { supabase } from '../lib/supabase.js';

export default function DisplayPage() {
  const isMounted = useRef(true);
  const activeTimeouts = useRef(new Set());

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      activeTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  const [activeOrders, setActiveOrders] = useState([]);
  const [recentlyReady, setRecentlyReady] = useState([]);
  const [connected, setConnected] = useState(false);
  const [time, setTime] = useState(new Date());
  const [audioEnabled, setAudioEnabled] = useState(false);

  const playedTokens = useRef(new Set());
  const hasLoaded = useRef(false);

  // Synth chime generator using Web Audio API
  const playChime = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      
      // Tone 1: C5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);
      
      // Tone 2: E5
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.1);
      gain2.gain.setValueAtTime(0, now + 0.1);
      gain2.gain.linearRampToValueAtTime(0.15, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.55);

      // Tone 3: G5
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(783.99, now + 0.2);
      gain3.gain.setValueAtTime(0, now + 0.2);
      gain3.gain.linearRampToValueAtTime(0.2, now + 0.25);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.2);
      osc3.stop(now + 0.8);
    } catch (err) {
      console.error('Audio chime error:', err);
    }
  };

  // Speaks announcement: "Table no. X Token no Y Order is ready"
  const speakAnnouncement = (order) => {
    try {
      if ('speechSynthesis' in window) {
        let text = "";
        if (order.order_type === 'DINE_IN') {
          text = `Table no. ${order.table_number} Token no. ${order.token_number} Order is ready`;
        } else {
          text = `Parcel Token no. ${order.token_number} Order is ready`;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        
        // Find English voice
        const englishVoice = voices.find(v => v.lang.startsWith('en'));
        if (englishVoice) {
          utterance.voice = englishVoice;
        }
        
        utterance.rate = 0.85; // highly clear and professional announcement rate
        utterance.pitch = 1.05;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('Speech synthesis error:', error);
    }
  };

  // Pre-chime followed by verbal announcement
  const playAnnouncement = (order) => {
    playChime();
    const timer = setTimeout(() => {
      if (isMounted.current) {
        speakAnnouncement(order);
      }
      activeTimeouts.current.delete(timer);
    }, 850);
    activeTimeouts.current.add(timer);
  };

  const debounceTimeout = useRef(null);

  useEffect(() => {
    // Clock effect
    const clockTimer = setInterval(() => {
      if (isMounted.current) setTime(new Date());
    }, 1000);

    const reloadOrders = () => {
      api.getActiveOrders()
        .then((orders) => {
          if (!isMounted.current) return;
          const sortedActive = [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          setActiveOrders(sortedActive);

          const activeReady = orders.filter(o => o.status === 'READY' || o.status === 'COMPLETED');

          // Find newly ready/completed orders that are not already marked
          activeReady.forEach(o => {
            if (!playedTokens.current.has(o.token_number)) {
              playedTokens.current.add(o.token_number);
              if (hasLoaded.current) {
                if (audioEnabled) {
                  playAnnouncement(o);
                }
              }
            }
          });

          // Update recentlyReady list keeping last 5 ready/completed orders
          setRecentlyReady(prev => {
            const newReady = activeReady.filter(o => !prev.some(p => p.id === o.id));
            newReady.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

            const updatedPrev = prev.map(p => {
              const latest = orders.find(o => o.id === p.id);
              return latest ? latest : { ...p, status: 'DELIVERED' };
            });

            const combined = [...newReady, ...updatedPrev];
            return combined.slice(0, 5);
          });

          hasLoaded.current = true;
        })
        .catch(() => {});
    };

    // Fetch active orders initially
    reloadOrders();

    if (isMounted.current) setConnected(true);

    const triggerReload = () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        reloadOrders();
      }, 150);
    };

    const channel = supabase
      .channel('display-orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, triggerReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, triggerReload)
      .subscribe();

    return () => {
      clearInterval(clockTimer);
      supabase.removeChannel(channel);
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [audioEnabled]);

  // Section 1 - Now Ready: All active orders that have status READY or COMPLETED in FCFS order (oldest first, limited to max 6)
  const readyActiveOrders = activeOrders.filter(o => o.status?.toUpperCase() === 'READY' || o.status?.toUpperCase() === 'COMPLETED').slice(0, 6);

  const mapStatus = (status) => {
    switch (status?.toUpperCase()) {
      case 'PENDING': return 'QUEUED';
      case 'COOKING': return 'COOKING';
      case 'PARTIALLY_SERVED': return 'PART SERVED';
      case 'READY': return 'READY';
      case 'COMPLETED': return 'READY';
      default: return status;
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toUpperCase()) {
      case 'PENDING': return '📋';
      case 'COOKING': return '🍳';
      case 'PARTIALLY_SERVED': return '🍽';
      case 'READY': return '🟢';
      case 'COMPLETED': return '🟢';
      default: return '⚡';
    }
  };

  const getStatusClass = (status) => {
    switch (status?.toUpperCase()) {
      case 'PENDING': return 'status-queued';
      case 'COOKING': return 'status-preparing';
      case 'PARTIALLY_SERVED': return 'status-preparing';
      case 'READY': return 'status-ready-badge';
      case 'COMPLETED': return 'status-ready-badge';
      default: return '';
    }
  };

  const handleEnableAudio = () => {
    playChime();
    setAudioEnabled(!audioEnabled);
    if (!audioEnabled) {
      const timer = setTimeout(() => {
        try {
          if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance("Audio announcements activated");
            window.speechSynthesis.speak(utterance);
          }
        } catch (e) {}
        activeTimeouts.current.delete(timer);
      }, 800);
      activeTimeouts.current.add(timer);
    }
  };

  return (
    <main className="display-page">
      <header className="display-header">
        <div className="sizzle-brand">
          <div className="sizzle-logo-box">🍽</div>
          <span className="sizzle-brand-text">Your Order Status</span>
        </div>
        <div className="header-right-controls">
          <button onClick={handleEnableAudio} className={`audio-toggle-btn ${audioEnabled ? 'enabled' : ''}`}>
            {audioEnabled ? '🔊 Sound On' : '🔇 Enable Sound'}
          </button>
          <div className="header-clock-container">
            <span className="header-clock-time">
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <span className="header-clock-icon">🕒</span>
          </div>
          <ConnectionBadge connected={connected} />
        </div>
      </header>

      <div className="display-board-grid">
        {/* SECTION 1 - NOW READY */}
        <section className="now-ready-section">
          <h2 className="now-ready-header-title">✓ NOW READY</h2>
          {readyActiveOrders.length > 0 ? (
            <div className="now-ready-container-grid">
              {readyActiveOrders.map((order) => (
                <div className="now-ready-card" key={order.id}>
                  <div className="now-ready-pulse-ring"></div>
                  <p className="sizzle-token-label">ORDER TOKEN</p>
                  <div className="sizzle-token-number">
                    {order.token_number}
                  </div>
                  <div className="sizzle-collect-pill">
                    PLEASE COLLECT
                  </div>
                  <div className="now-ready-badge-row">
                    <span className="now-ready-badge-text">
                      {order.order_type === 'DINE_IN' ? `🍽 Table ${order.table_number}` : '🛍 Parcel'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="now-ready-card-empty">
              <p className="now-ready-placeholder">No orders ready yet</p>
            </div>
          )}
        </section>

        {/* SECTION 2 - IN PROGRESS */}
        <section className="in-progress-section">
          <h2 className="in-progress-header-title">⌛ IN PROGRESS</h2>
          <div className="in-progress-container">
            {activeOrders.filter(o => o.status?.toUpperCase() === 'PENDING' || o.status?.toUpperCase() === 'COOKING' || o.status?.toUpperCase() === 'PARTIALLY_SERVED').length === 0 ? (
              <p className="in-progress-empty">No active orders</p>
            ) : (
              <div className="in-progress-list">
                {activeOrders
                  .filter(o => o.status?.toUpperCase() === 'PENDING' || o.status?.toUpperCase() === 'COOKING' || o.status?.toUpperCase() === 'PARTIALLY_SERVED')
                  .map((order) => (
                    <div className="in-progress-row" key={order.id}>
                      <div className="in-progress-token-info">
                        <span className="sizzle-progress-token-label">TOKEN</span>
                        <span className="sizzle-progress-token-number">#{order.token_number}</span>
                      </div>
                      <div className="in-progress-type-table">
                        {order.order_type === 'DINE_IN' ? `🍽 Table ${order.table_number}` : '🛍 Parcel'}
                      </div>
                      <span className={`sizzle-progress-status-badge ${getStatusClass(order.status)}`}>
                        {getStatusIcon(order.status)} {mapStatus(order.status)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            <div className="in-progress-footer-note">
              Freshly prepared for you
            </div>
          </div>
        </section>

        {/* SECTION 3 - RECENTLY READY */}
        <section className="recently-ready-section">
          <h2 className="recently-ready-header-title">🛍 RECENTLY READY & DELIVERED</h2>
          <div className="recently-ready-grid">
            {recentlyReady.length === 0 ? (
              <div className="recently-ready-empty">No recently ready orders</div>
            ) : (
              recentlyReady.map((order) => (
                <div 
                  className={`recently-ready-card ${order.status?.toUpperCase() === 'DELIVERED' ? 'delivered' : ''}`} 
                  key={order.id}
                >
                  <div className="recently-ready-token">Token {order.token_number}</div>
                  <span className="recently-ready-badge">
                    {order.order_type === 'DINE_IN' ? '🍽 Dine In' : '🛍 Parcel'}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}


