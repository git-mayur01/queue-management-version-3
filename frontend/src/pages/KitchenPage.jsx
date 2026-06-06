import { useEffect, useState, useMemo, useRef } from 'react';
import AggregationPanel from '../components/AggregationPanel.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import OrderCard from '../components/OrderCard.jsx';
import StatsPanel from '../components/StatsPanel.jsx';
import { api } from '../services/api.js';
import { supabase } from '../lib/supabase.js';

// ── Compact summary strip (mobile only) ─────────────────────────
function KitchenSummaryStrip({ stats, activeCount }) {
  return (
    <div className="kitchen-summary-strip">
      <div className="kss-item">
        <span className="kss-label">Active</span>
        <strong className="kss-value kss-active">{activeCount}</strong>
      </div>
      <div className="kss-divider" />
      <div className="kss-item">
        <span className="kss-label">Pending</span>
        <strong className="kss-value">{stats?.pendingOrders ?? 0}</strong>
      </div>
      <div className="kss-divider" />
      <div className="kss-item">
        <span className="kss-label">Cooking</span>
        <strong className="kss-value kss-cooking">{stats?.cookingOrders ?? 0}</strong>
      </div>
      <div className="kss-divider" />
      <div className="kss-item">
        <span className="kss-label">Ready</span>
        <strong className="kss-value kss-ready">{stats?.readyOrders ?? 0}</strong>
      </div>
    </div>
  );
}

// ── Mobile Pending Items List ─────────────────────────────────────
function MobilePendingItems({ items }) {
  // Sort by quantity descending
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.quantity - a.quantity),
    [items]
  );

  if (sorted.length === 0) {
    return (
      <div className="kitchen-tab-empty">
        <span className="kitchen-tab-empty-icon">🍳</span>
        <p>No pending items right now. All clear!</p>
      </div>
    );
  }

  return (
    <ul className="mobile-pending-list">
      {sorted.map((item, idx) => (
        <li
          key={`${item.item_name}-${item.portion}`}
          className="mobile-pending-row"
          style={{ animationDelay: `${idx * 40}ms` }}
        >
          <div className="mpr-left">
            <span className="mpr-rank">#{idx + 1}</span>
            <div className="mpr-info">
              <span className="mpr-name">{item.item_name}</span>
              <span className={`portion-tag tag-${(item.portion || 'full').toLowerCase()}`}>
                {item.portion || 'Full'}
              </span>
            </div>
          </div>
          <div className="mpr-qty-wrap">
            <span className="mpr-qty">{item.quantity}</span>
            <span className="mpr-qty-label">qty</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Main KitchenPage ─────────────────────────────────────────────
export default function KitchenPage() {
  const isMounted = useRef(true);
  const activeTimers = useRef(new Set());

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      activeTimers.current.forEach(clearTimeout);
    };
  }, []);

  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [aggregation, setAggregation] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const newlyCreatedOrderIds = useRef(new Set());
  const [highlightedOrderIds, setHighlightedOrderIds] = useState(new Set());

  // Mobile tab state: 'active' | 'pending'
  const [activeTab, setActiveTab] = useState('active');
  const [tabDirection, setTabDirection] = useState('none'); // 'left' | 'right'

  const debounceTimeout = useRef(null);
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const accumulatedEvents = useRef([]);
  const accumulateTimeout = useRef(null);

  useEffect(() => {
    Promise.all([api.getActiveOrders(), api.getStats(), api.getAggregation()])
      .then(([activeOrders, nextStats, nextAggregation]) => {
        if (isMounted.current) {
          setOrders(activeOrders);
          setStats(nextStats);
          setAggregation(nextAggregation);
        }
      })
      .catch((err) => {
        if (isMounted.current) setError(err.message);
      });

    if (isMounted.current) setConnected(true);

    const triggerReload = () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        Promise.all([api.getActiveOrders(), api.getStats(), api.getAggregation()])
          .then(([activeOrders, nextStats, nextAggregation]) => {
            if (isMounted.current) {
              setOrders(activeOrders);
              setStats(nextStats);
              setAggregation(nextAggregation);
            }
          })
          .catch((err) => {
            if (isMounted.current) setError(err.message);
          });
      }, 150);
    };

    const handleOrderEvent = (payload) => {
      triggerReload();

      if (!isMounted.current) return;

      if (payload.eventType === 'INSERT') {
        const newOrderId = payload.new.id;
        newlyCreatedOrderIds.current.add(newOrderId);
        const timer = setTimeout(() => {
          newlyCreatedOrderIds.current.delete(newOrderId);
          activeTimers.current.delete(timer);
        }, 10000);
        activeTimers.current.add(timer);
      }
    };

    const processAccumulatedEvents = async () => {
      const events = [...accumulatedEvents.current];
      accumulatedEvents.current = [];

      if (events.length === 0) return;

      const eventsByOrder = {};
      for (const e of events) {
        const orderId = e.new?.order_id || e.old?.order_id;
        if (!orderId) continue;
        if (!eventsByOrder[orderId]) {
          eventsByOrder[orderId] = [];
        }
        eventsByOrder[orderId].push(e);
      }

      for (const [orderIdStr, orderEvents] of Object.entries(eventsByOrder)) {
        const orderId = Number(orderIdStr);
        const existingOrder = ordersRef.current.find(o => o.id === orderId);
        if (!existingOrder) continue;

        const newNotif = {
          id: Date.now() + Math.random(),
          title: '⚠️ Active Order Updated',
          subtitle: `Order #${existingOrder.token_number}`,
          message: 'Items were added, removed, or modified. Please review the updated order.',
          color: 'amber'
        };

        setNotifications((prev) => {
          const isDuplicate = prev.some(n => n.subtitle === newNotif.subtitle);
          if (isDuplicate) return prev;
          return [...prev, newNotif];
        });

        // Set card highlight
        setHighlightedOrderIds((prev) => {
          const next = new Set(prev);
          next.add(orderId);
          return next;
        });

        const timerNotif = setTimeout(() => {
          if (isMounted.current) {
            setNotifications((prev) => prev.filter((n) => n.id !== newNotif.id));
          }
          activeTimers.current.delete(timerNotif);
        }, 5000);
        activeTimers.current.add(timerNotif);

        const timerHighlight = setTimeout(() => {
          if (isMounted.current) {
            setHighlightedOrderIds((prev) => {
              const next = new Set(prev);
              next.delete(orderId);
              return next;
            });
          }
          activeTimers.current.delete(timerHighlight);
        }, 5000);
        activeTimers.current.add(timerHighlight);
      }
    };

    const handleOrderItemEvent = (payload) => {
      triggerReload();

      if (!isMounted.current) return;

      const orderId = payload.new?.order_id || payload.old?.order_id;
      if (!orderId) return;

      // Ignore if order was newly created
      if (newlyCreatedOrderIds.current.has(orderId)) {
        return;
      }

      // Ignore status updates
      if (payload.eventType === 'UPDATE') {
        const itemId = payload.new?.id || payload.old?.id;
        const localOrder = ordersRef.current.find(o => o.id === orderId);
        const localItem = localOrder?.items?.find(i => i.id === itemId);

        if (localItem) {
          const oldQty = localItem.quantity;
          const oldName = localItem.item_name;
          const oldPortion = localItem.portion;
          const oldStatus = localItem.status;

          const newQty = payload.new?.quantity;
          const newName = payload.new?.item_name;
          const newPortion = payload.new?.portion;
          const newStatus = payload.new?.status;

          if (
            oldQty === newQty &&
            oldName === newName &&
            oldPortion === newPortion &&
            oldStatus !== newStatus
          ) {
            return;
          }
        } else {
          return;
        }
      }

      // Verify the order exists in current active orders list
      const isExistingActive = ordersRef.current.some(o => o.id === orderId);
      if (!isExistingActive) {
        return;
      }

      accumulatedEvents.current.push(payload);

      if (accumulateTimeout.current) {
        clearTimeout(accumulateTimeout.current);
      }

      accumulateTimeout.current = setTimeout(() => {
        if (isMounted.current) {
          processAccumulatedEvents();
        }
        accumulateTimeout.current = null;
      }, 1000);
    };

    const channel = supabase
      .channel('kitchen-orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handleOrderEvent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, handleOrderItemEvent)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      if (accumulateTimeout.current) {
        clearTimeout(accumulateTimeout.current);
      }
    };
  }, []);

  function switchTab(tab) {
    if (tab === activeTab) return;
    setTabDirection(tab === 'pending' ? 'right' : 'left');
    setActiveTab(tab);
  }

  async function handleStatusChange(id, status) {
    if (isMounted.current) {
      setBusyOrderId(id);
      setError('');
    }
    try {
      await api.updateStatus(id, status);
    } catch (err) {
      if (isMounted.current) setError(err.message);
    } finally {
      if (isMounted.current) setBusyOrderId(null);
    }
  }

  async function handleItemStatusChange(orderId, itemId, status) {
    if (isMounted.current) setError('');
    try {
      await api.updateItemStatus(orderId, itemId, status);
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  }

  async function handleBulkComplete(itemName, portion) {
    if (isMounted.current) setError('');
    try {
      await api.bulkCompleteItem(itemName, portion);
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  }

  const sortedOrders = orders.slice().sort((a, b) => a.token_number - b.token_number);

  return (
    <main className="page kitchen-page">
      <PageHeader title="Kitchen" connected={connected} />

      <ErrorMessage message={error} />

      {/* ═══════════ DESKTOP VIEW (≥ 768px) ═══════════ */}
      <div className="kitchen-desktop-view">
        <StatsPanel stats={stats} />
        <div className="kitchen-layout">
          <AggregationPanel items={aggregation} />
          <section className="panel order-board">
            <div className="section-title-row">
              <h2>Active Orders</h2>
            </div>
            {orders.length === 0 ? (
              <p className="empty-state">No active orders. The board is clear.</p>
            ) : (
              <div className="orders-grid">
                {sortedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={handleStatusChange}
                    busy={busyOrderId === order.id}
                    isKitchen={true}
                    onItemStatusChange={handleItemStatusChange}
                    highlighted={highlightedOrderIds.has(order.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ═══════════ MOBILE VIEW (< 768px) ═══════════ */}
      <div className="kitchen-mobile-view">

        {/* Compact summary strip */}
        <KitchenSummaryStrip stats={stats} activeCount={orders.length} />

        {/* Segmented tab nav */}
        <div className="kitchen-tab-nav" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'active'}
            className={`kitchen-tab-btn ${activeTab === 'active' ? 'ktab-active' : ''}`}
            onClick={() => switchTab('active')}
            id="tab-active"
          >
            <span className="ktab-icon">🍳</span>
            <span>Active Orders</span>
            {orders.length > 0 && (
              <span className="ktab-badge">{orders.length}</span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'pending'}
            className={`kitchen-tab-btn ${activeTab === 'pending' ? 'ktab-active' : ''}`}
            onClick={() => switchTab('pending')}
            id="tab-pending"
          >
            <span className="ktab-icon">📋</span>
            <span>Pending Items</span>
            {aggregation.length > 0 && (
              <span className="ktab-badge ktab-badge-amber">{aggregation.length}</span>
            )}
          </button>
        </div>

        {/* Sliding tab content */}
        <div
          className="kitchen-tab-content-wrap"
          aria-live="polite"
        >
          {/* Active Orders panel */}
          <div
            role="tabpanel"
            aria-labelledby="tab-active"
            className={`kitchen-tab-panel ${
              activeTab === 'active'
                ? 'ktab-panel-visible'
                : tabDirection === 'right'
                ? 'ktab-panel-exit-left'
                : 'ktab-panel-hidden-right'
            }`}
          >
            {sortedOrders.length === 0 ? (
              <div className="kitchen-tab-empty">
                <span className="kitchen-tab-empty-icon">✅</span>
                <p>No active orders — the board is clear!</p>
              </div>
            ) : (
              <div className="orders-grid kitchen-mobile-orders-grid">
                {sortedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={handleStatusChange}
                    busy={busyOrderId === order.id}
                    isKitchen={true}
                    onItemStatusChange={handleItemStatusChange}
                    highlighted={highlightedOrderIds.has(order.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pending Items panel */}
          <div
            role="tabpanel"
            aria-labelledby="tab-pending"
            className={`kitchen-tab-panel ${
              activeTab === 'pending'
                ? 'ktab-panel-visible'
                : tabDirection === 'left'
                ? 'ktab-panel-exit-right'
                : 'ktab-panel-hidden-left'
            }`}
          >
            <MobilePendingItems items={aggregation} />
          </div>
        </div>
      </div>

      {/* Floating Notifications */}
      <div className="kitchen-notifications-container">
        {notifications.map((notif) => (
          <div key={notif.id} className={`kitchen-notification-card ${notif.color || 'blue'}`}>
            <header className="notification-header">
              <span className="notification-badge-icon">🔔</span>
              <strong>{notif.title}</strong>
            </header>
            <div className="notification-body">
              <h3 className="notification-table">{notif.subtitle}</h3>
              <p className="notification-message">{notif.message}</p>
            </div>
            <button
              className="notification-close-btn"
              onClick={() => setNotifications((prev) => prev.filter((n) => n.id !== notif.id))}
            >
              ×
            </button>
            <div className="notification-progress-bar-wrap">
              <div className="notification-progress-bar" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
