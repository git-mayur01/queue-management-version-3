const KDS_STATUS_ABBR = {
  PENDING: 'PND',
  COOKING: 'CKG',
  READY: 'RDY',
  SERVED: 'SRV'
};

export default function OrderItems({ items = [], hidePrice, showCheckboxes, isKitchen, onItemStatusToggle }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ padding: '0.75rem 0', textAlign: 'center', color: 'var(--muted)', fontWeight: 800, fontSize: '0.85rem' }}>
        No items in this order
      </div>
    );
  }

  return (
    <ul className="item-list" style={{ display: 'flex', flexDirection: 'column', gap: isKitchen ? '0.45rem' : '0', padding: 0, margin: 0, listStyle: 'none' }}>
      {items.map((item) => {
        const status = item.status?.toUpperCase() || 'PENDING';
        const isReady = status === 'READY';
        const isServed = status === 'SERVED';
        const displayName = `${item.portion || 'Full'} ${item.item_name}`;

        // ── Kitchen item card (secondary, nested look) ────────
        if (showCheckboxes) {
          // Per-status visual tokens
          let itemBg, itemBorder, badgeColor, badgeBg, badgeBorder, textDecor, textColor, itemOpacity;

          if (status === 'PENDING') {
            itemBg = '#fff7ed';
            itemBorder = '#fed7aa';
            badgeColor = '#ea580c';
            badgeBg = '#ffedd5';
            badgeBorder = '1.5px solid #fed7aa';
            textDecor = 'none';
            textColor = 'var(--ink)';
            itemOpacity = '1';
          } else if (status === 'COOKING') {
            itemBg = '#eff6ff';
            itemBorder = '#bfdbfe';
            badgeColor = '#2563eb';
            badgeBg = '#dbeafe';
            badgeBorder = '1.5px solid #bfdbfe';
            textDecor = 'none';
            textColor = 'var(--ink)';
            itemOpacity = '1';
          } else if (status === 'READY') {
            itemBg = '#ecfdf5';
            itemBorder = '#a7f3d0';
            badgeColor = '#059669';
            badgeBg = '#d1fae5';
            badgeBorder = '1.5px solid #a7f3d0';
            textDecor = 'line-through';
            textColor = 'var(--muted)';
            itemOpacity = '1';
          } else {
            // SERVED
            itemBg = '#f4f4f5';
            itemBorder = '#e4e4e7';
            badgeColor = '#71717a';
            badgeBg = '#f4f4f5';
            badgeBorder = '1.5px solid #e4e4e7';
            textDecor = 'line-through';
            textColor = 'var(--muted)';
            itemOpacity = '0.7';
          }

          return (
            <li
              key={`${item.id || item.item_name}-${item.item_name}-${item.portion}`}
              className={`oc-item-card status-${status.toLowerCase()}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                /* ── Secondary visual: lighter, smaller, no shadow ── */
                padding: '0.45rem 0.7rem',
                borderRadius: '0.55rem',
                background: itemBg,
                border: `2px solid ${itemBorder}`,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease',
                opacity: itemOpacity,
              }}
              onClick={() => onItemStatusToggle && onItemStatusToggle(item.id, item.status)}
            >
              {/* Row 1: Qty | Portion | Item Name */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', width: '100%' }}>
                {/* Column 1: Quantity */}
                <strong style={{
                  fontSize: '1.05rem',
                  fontWeight: '900',
                  color: isReady || isServed ? 'var(--muted)' : 'var(--primary-dark)',
                  width: '45px',
                  textAlign: 'center',
                  flexShrink: 0,
                  display: 'inline-block',
                }}>
                  {item.quantity}×
                </strong>
                
                {/* Column 2: Portion (Size) */}
                <span style={{
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  color: isReady || isServed ? 'var(--muted)' : 'var(--ink)',
                  width: '50px',
                  textAlign: 'center',
                  flexShrink: 0,
                  display: 'inline-block',
                  lineHeight: '1.2',
                }}>
                  {item.portion ? (item.portion.charAt(0).toUpperCase() + item.portion.slice(1).toLowerCase()) : 'Full'}
                </span>

                {/* Column 3: Item Name */}
                <span
                  style={{
                    fontWeight: '800',
                    fontSize: '0.95rem',
                    textDecoration: textDecor,
                    color: textColor,
                    lineHeight: '1.2',
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.item_name}
                </span>
              </div>

              {/* Row 2: [ORDER TYPE] (Left) | [STATUS] (Right) */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                marginTop: '0.1rem'
              }}>
                {/* Left: Order Type */}
                <div style={{ marginLeft: 'calc(95px + 1.3rem)' }}>
                  {item.order_type ? (
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '4px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      background: item.order_type === 'DINE_IN' ? '#eff6ff' : '#fff7ed',
                      color: item.order_type === 'DINE_IN' ? '#2563eb' : '#ea580c',
                      border: item.order_type === 'DINE_IN' ? '1px solid #bfdbfe' : '1px solid #fed7aa',
                      display: 'inline-block',
                    }}>
                      {item.order_type === 'DINE_IN' ? 'DINE IN' : 'PARCEL'}
                    </span>
                  ) : (
                    <span></span>
                  )}
                </div>

                {/* Right: Status */}
                <span style={{
                  fontSize: '0.68rem',
                  background: badgeBg,
                  color: badgeColor,
                  border: badgeBorder,
                  padding: '0.1rem 0.45rem',
                  borderRadius: '4px',
                  fontWeight: '900',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  display: 'inline-block',
                }}>
                  {KDS_STATUS_ABBR[status] || status}
                </span>
              </div>
            </li>
          );
        }

        // ── Cashier default layout (unchanged) ────────────────
        return (
          <li
            key={`${item.id || item.item_name}-${item.item_name}-${item.portion}`}
            className="order-item-row"
            style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--line)' }}
          >
            <div className="order-item-desc">
              <span className="order-item-name" style={{ fontWeight: '800', display: 'block' }}>{item.item_name}</span>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                {item.portion && (
                  <span className={`portion-tag tag-${item.portion.toLowerCase()}`}>{item.portion}</span>
                )}
                {item.order_type && (
                  <span
                    className={`portion-tag tag-${item.order_type.toLowerCase() === 'dine_in' ? 'dinein' : 'parcel'}`}
                    style={{
                      textTransform: 'uppercase', fontSize: '0.72rem',
                      background: item.order_type === 'DINE_IN' ? '#eff6ff' : '#fff7ed',
                      color: item.order_type === 'DINE_IN' ? '#2563eb' : '#ea580c',
                      border: item.order_type === 'DINE_IN' ? '1px solid #bfdbfe' : '1px solid #fed7aa',
                    }}
                  >
                    {item.order_type === 'DINE_IN' ? 'DINE IN' : 'PARCEL'}
                  </span>
                )}
              </div>
            </div>
            <div className="order-item-qty-price">
              <strong>×{item.quantity}</strong>
              {!hidePrice && item.unit_price > 0 && (
                <span className="order-item-price" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'right' }}>
                  @ ₹{item.unit_price} = ₹{item.total_price}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
