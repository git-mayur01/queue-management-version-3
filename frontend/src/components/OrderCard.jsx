import OrderItems from './OrderItems.jsx';
import { safeParseDate } from '../utils/date.js';

const STATUSES = ['PENDING', 'COOKING', 'READY', 'DELIVERED'];

const getNextStatus = (currentStatus) => {
  if (currentStatus === 'PENDING') return 'COOKING';
  if (currentStatus === 'COOKING') return 'READY';
  if (currentStatus === 'READY') return 'DELIVERED';
  return null;
};

function formatTime(value) {
  const dateObj = safeParseDate(value);
  if (!dateObj) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(dateObj);
  } catch (error) {
    console.error("Time formatting error:", error);
    return '';
  }
}

// ── Status colour map for kitchen header strips ─────────────────
const STATUS_THEME = {
  PENDING: {
    headerBg:     '#fff7ed',
    headerBorder: '#f97316',
    accentBorder: '#f97316',
    cardBg:       '#ffffff',
    dot:          '#f97316',
    label:        'Pending',
  },
  COOKING: {
    headerBg:     '#eff6ff',
    headerBorder: '#3b82f6',
    accentBorder: '#3b82f6',
    cardBg:       '#ffffff',
    dot:          '#3b82f6',
    label:        'Cooking',
  },
  READY: {
    headerBg:     '#ecfdf5',
    headerBorder: '#10b981',
    accentBorder: '#10b981',
    cardBg:       '#ffffff',
    dot:          '#10b981',
    label:        'Ready',
  },
  COMPLETED: {
    headerBg:     '#ecfdf5',
    headerBorder: '#10b981',
    accentBorder: '#10b981',
    cardBg:       '#ffffff',
    dot:          '#10b981',
    label:        'Ready',
  },
  DELIVERED: {
    headerBg:     '#f4f4f5',
    headerBorder: '#71717a',
    accentBorder: '#71717a',
    cardBg:       '#fafafa',
    dot:          '#71717a',
    label:        'Delivered',
  },
};

export default function OrderCard({ order, onStatusChange, onAddItem, busy, isKitchen, onItemStatusChange, onRemoveItem }) {
  const nextStatus = getNextStatus(order.status);
  const totalItems  = order.items ? order.items.length : 0;
  const readyItems  = order.items
    ? order.items.filter(item => item.status === 'READY' || item.status === 'SERVED').length
    : 0;
  const progressPercent = totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;

  const theme = STATUS_THEME[order.status?.toUpperCase()] || STATUS_THEME.PENDING;

  // ── Kitchen card ──────────────────────────────────────────────
  if (isKitchen) {
    return (
      <article
        className={`oc-kitchen-card oc-status-${order.status.toLowerCase()}`}
        style={{
          background: theme.cardBg,
          border: `2.5px solid ${theme.accentBorder}`,
          borderRadius: '1.25rem',
          boxShadow: `0 6px 24px rgba(0,0,0,0.07), 0 0 0 1px ${theme.accentBorder}22`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* ── ORDER HEADER STRIP ─────────────────────────────── */}
        <header
          className="oc-header-strip"
          style={{
            background: theme.headerBg,
            borderBottom: `2px solid ${theme.headerBorder}`,
            padding: '0.7rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Left: Token number */}
          <div className="oc-token-block">
            <span className="oc-token-eyebrow">Token</span>
            <span
              className="oc-token-number"
              style={{ color: theme.accentBorder }}
            >
              #{order.token_number}
            </span>
          </div>

          {/* Right: time + table */}
          <div className="oc-header-right">
            <span className="oc-time-tag">{formatTime(order.created_at)}</span>
            <span
              className="oc-table-tag"
              style={{ color: theme.accentBorder }}
            >
              {order.order_type === 'DINE_IN' ? `Table ${order.table_number}` : 'Parcel'}
            </span>
          </div>
        </header>

        {/* ── ITEMS AREA ─────────────────────────────────────── */}
        <div
          className="order-items-scroll"
          style={{
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            maxHeight: '300px',
            padding: '0.75rem 0.85rem',
          }}
        >
          <OrderItems
            items={order.items || []}
            hidePrice={true}
            showCheckboxes={true}
            isKitchen={true}
            onItemStatusToggle={(itemId, currentStatus) => {
              const status = currentStatus?.toUpperCase() || 'PENDING';
              let next = null;
              if (status === 'PENDING')  next = 'COOKING';
              else if (status === 'COOKING') next = 'READY';
              else if (status === 'READY')   next = 'SERVED';
              if (next && onItemStatusChange) onItemStatusChange(order.id, itemId, next);
            }}
          />
        </div>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <footer
          className="oc-footer"
          style={{
            borderTop: '1.5px dashed ' + theme.headerBorder + '55',
            padding: '0.65rem 0.85rem 0.85rem',
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {/* Progress — no percentage text */}
          {totalItems > 0 && (
            <div className="oc-progress-wrap">
              <span className="oc-progress-label">
                Ready Items: <strong>{readyItems}</strong> / {totalItems}
              </span>
              <div className="oc-progress-track">
                <div
                  className="oc-progress-fill"
                  style={{
                    width: `${progressPercent}%`,
                    background: progressPercent === 100 ? 'var(--green)' : theme.accentBorder,
                  }}
                />
              </div>
            </div>
          )}

          {/* Mark Delivered button */}
          {(order.status === 'COMPLETED' || order.status === 'READY') && onStatusChange && (
            <button
              type="button"
              className="oc-mark-delivered-btn"
              disabled={busy}
              onClick={() => onStatusChange(order.id, 'DELIVERED')}
            >
              ✓ Mark Delivered
            </button>
          )}
        </footer>
      </article>
    );
  }

  // ── Cashier / default card (unchanged) ───────────────────────
  return (
    <article
      className={`order-card status-${order.status.toLowerCase()}`}
      style={{
        display: 'block',
        boxSizing: 'border-box',
        padding: '1.25rem',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <header
        className="order-card-header-bar"
        style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Token</p>
            <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900 }}>#{order.token_number}</h2>
          </div>
          <span
            className={`status-pill status-${order.status.toLowerCase()}`}
            style={{ fontSize: '0.85rem', fontWeight: '900', padding: '0.4rem 0.8rem', borderRadius: '999px', textTransform: 'uppercase' }}
          >
            {order.status}
          </span>
        </div>
        <div className="order-meta" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontWeight: 800, fontSize: '0.9rem', margin: 0 }}>
          <span>{order.order_type === 'DINE_IN' ? `Table ${order.table_number}` : 'Parcel'}</span>
          <span>{formatTime(order.created_at)}</span>
        </div>
      </header>

      {/* Items */}
      <div
        className="order-items-scroll"
        style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: '245px', paddingRight: '0.25rem', paddingTop: '0' }}
      >
        <OrderItems
          items={order.items || []}
          hidePrice={false}
          showCheckboxes={false}
          onItemStatusToggle={(itemId, currentStatus) => {
            const status = currentStatus?.toUpperCase() || 'PENDING';
            let next = null;
            if (status === 'PENDING')  next = 'COOKING';
            else if (status === 'COOKING') next = 'READY';
            else if (status === 'READY')   next = 'SERVED';
            if (next && onItemStatusChange) onItemStatusChange(order.id, itemId, next);
          }}
        />
      </div>

      {/* Footer */}
      <footer style={{ marginTop: '0.75rem' }}>
        {!isKitchen && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--line)', paddingTop: '0.75rem', marginBottom: '0.5rem', fontWeight: '800' }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Total Amount</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--primary-dark)' }}>
              ₹{order.items ? order.items.reduce((sum, item) => sum + (item.total_price || 0), 0) : 0}
            </strong>
          </div>
        )}

        {onAddItem && order.status !== 'DELIVERED' && (
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', boxSizing: 'border-box' }}>
            <button
              type="button"
              className="add-item-action-btn"
              style={{ flex: 1, margin: 0, padding: '0.7rem 0.5rem', background: 'var(--green)', color: 'white', border: '0', borderRadius: '0.8rem', fontWeight: '900', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}
              onClick={() => onAddItem(order)}
            >
              + Add Item
            </button>
            {onRemoveItem && (
              <button
                type="button"
                className="remove-item-action-btn"
                style={{ flex: 1, margin: 0, padding: '0.7rem 0.5rem', background: 'transparent', color: 'var(--primary)', border: '2px solid var(--primary)', borderRadius: '0.8rem', fontWeight: '900', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}
                onClick={() => onRemoveItem(order)}
              >
                ✕ Remove
              </button>
            )}
          </div>
        )}

        {onStatusChange && !isKitchen && (
          <div className="status-actions" style={{ marginTop: '0.5rem' }} aria-label={`Update status for token ${order.token_number}`}>
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={order.status === status ? 'selected' : ''}
                disabled={busy || status !== nextStatus}
                onClick={() => onStatusChange(order.id, status)}
              >
                {status[0] + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}
