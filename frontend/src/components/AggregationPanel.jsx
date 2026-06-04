export default function AggregationPanel({ items }) {
  return (
    <section className="panel aggregation-panel">
      <div className="section-title-row">
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>Pending Item Counts</h2>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">No pending kitchen items.</p>
      ) : (
        <ul className="aggregation-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {items.map((item) => (
            <li 
              key={`${item.item_name}-${item.portion}`} 
              className="aggregation-item-row" 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: '#faf9f6', 
                padding: '1rem 1.25rem', 
                borderRadius: '0.8rem', 
                border: '1px solid var(--line)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
              }}
            >
              {/* Item Info (Primary Focus) */}
              <div className="aggregation-item-desc" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span className="agg-item-name" style={{ fontWeight: '900', fontSize: '1.25rem', color: 'var(--ink)' }}>
                  {item.item_name}
                </span>
                <span className={`portion-tag tag-${(item.portion || 'Full').toLowerCase()}`} style={{ display: 'inline-block', width: 'fit-content' }}>
                  {item.portion || 'Full'}
                </span>
              </div>

              {/* Large, Bold Quantity (Secondary Focus) */}
              <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '1.5rem' }}>
                <span 
                  className="agg-quantity"
                  style={{ 
                    fontSize: '2.5rem', 
                    fontWeight: '900', 
                    color: 'var(--primary-dark)',
                    lineHeight: 1
                  }}
                >
                  {item.quantity}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

