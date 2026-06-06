import { useEffect, useMemo, useState, useRef } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import OrderCard from '../components/OrderCard.jsx';
import OrderItems from '../components/OrderItems.jsx';
import { api } from '../services/api.js';
import { supabase } from '../lib/supabase.js';
import { safeParseDate } from '../utils/date.js';

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

export default function CashierPage() {
  const isMounted = useRef(true);
  const activeTimers = useRef([]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      activeTimers.current.forEach(clearTimeout);
    };
  }, []);

  const [menu, setMenu] = useState([]);
  const [orderType, setOrderType] = useState('DINE_IN');
  const [tableNumber, setTableNumber] = useState('');
  const [cart, setCart] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const [readyOrders, setReadyOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Portion selection modal states
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [selectedPortion, setSelectedPortion] = useState('Full');
  const [selectedQuantity, setSelectedQuantity] = useState(1);

  // Active Orders and Add/Remove Item to existing order modal states
  const [activeOrders, setActiveOrders] = useState([]);
  const [activeOrderEditing, setActiveOrderEditing] = useState(null);
  const [selectedModalItem, setSelectedModalItem] = useState(null);
  const [selectedModalPortion, setSelectedModalPortion] = useState('Full');
  const [selectedModalQuantity, setSelectedModalQuantity] = useState(1);
  const [selectedModalOrderType, setSelectedModalOrderType] = useState('DINE_IN');
  const [activeOrderRemoving, setActiveOrderRemoving] = useState(null);
  const [selectedItemsToRemove, setSelectedItemsToRemove] = useState(new Set());
  const [removeError, setRemoveError] = useState('');
  const [showInlineTableInput, setShowInlineTableInput] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('ALL');

  const toggleOrderExpand = (orderId) => {
    setExpandedOrderId(prev => prev === orderId ? null : orderId);
  };

  const debounceTimeout = useRef(null);

  useEffect(() => {
    const reloadMenu = () => {
      api.getMenu()
        .then((data) => {
          if (isMounted.current) setMenu(data.items);
        })
        .catch((err) => {
          if (isMounted.current) setError(err.message);
        });
    };

    const reloadActiveOrders = () => {
      api.getActiveOrders()
        .then((data) => {
          if (isMounted.current) {
            setActiveOrders(data);
            const ready = data.filter(o => o.status === 'READY');
            setReadyOrders(ready);
          }
        })
        .catch((err) => {
          if (isMounted.current) setError(err.message);
        });
    };

    // Load initial menu and active orders
    reloadMenu();
    reloadActiveOrders();

    if (isMounted.current) setConnected(true);

    const triggerReloadOrders = () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        reloadActiveOrders();
      }, 150);
    };

    // Subscribe to menu_items changes
    const menuChannel = supabase
      .channel('cashier-menu-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, reloadMenu)
      .subscribe();

    // Subscribe to orders and order_items changes
    const ordersChannel = supabase
      .channel('cashier-orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, triggerReloadOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, triggerReloadOrders)
      .subscribe();

    return () => {
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(ordersChannel);
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  const totalItems = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const billAmount = useMemo(() => cart.reduce((sum, item) => sum + item.total_price, 0), [cart]);

  const sortedMenu = useMemo(() => {
    return [...menu].sort((a, b) => a.name.localeCompare(b.name));
  }, [menu]);

  function handleTableNumberChange(event) {
    const val = event.target.value.replace(/\D/g, ''); // only digits
    if (val === '') {
      setTableNumber('');
      return;
    }
    const num = parseInt(val, 10);
    if (num <= 15) {
      setTableNumber(num.toString());
    }
  }

  function handleMenuClick(item) {
    if (!item.available) return; // ignore if out of stock
    setActiveModalItem(item);
    // Set default portion based on what is available
    if (item.fullPrice > 0) {
      setSelectedPortion('Full');
    } else if (item.halfPrice > 0) {
      setSelectedPortion('Half');
    } else {
      setSelectedPortion('Full');
    }
    setSelectedQuantity(1);
  }

  function addToCart() {
    if (!activeModalItem) return;

    const portion = selectedPortion;
    const qty = selectedQuantity;
    const unitPrice = portion === 'Half' ? activeModalItem.halfPrice : activeModalItem.fullPrice;

    setCart((current) => {
      const existing = current.find(
        (item) => item.item_name === activeModalItem.name && item.portion === portion
      );
      if (existing) {
        return current.map((item) =>
          item.item_name === activeModalItem.name && item.portion === portion
            ? { ...item, quantity: item.quantity + qty, total_price: (item.quantity + qty) * unitPrice }
            : item
        );
      }
      return [
        ...current,
        {
          item_name: activeModalItem.name,
          portion,
          quantity: qty,
          unit_price: unitPrice,
          total_price: qty * unitPrice
        }
      ];
    });

    setActiveModalItem(null);
  }

  function changeQuantity(itemName, portion, delta) {
    setCart((current) => current
      .map((item) => {
        if (item.item_name === itemName && item.portion === portion) {
          const newQty = item.quantity + delta;
          return { ...item, quantity: newQty, total_price: newQty * item.unit_price };
        }
        return item;
      })
      .filter((item) => item.quantity > 0));
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (isMounted.current) setError('');

    if (cart.length === 0) {
      if (isMounted.current) setError('Add at least one item before generating an order.');
      return;
    }

    if (orderType === 'DINE_IN') {
      const tableNum = parseInt(tableNumber, 10);
      if (!tableNumber.trim()) {
        if (!showInlineTableInput) {
          if (isMounted.current) setShowInlineTableInput(true);
          return;
        } else {
          if (isMounted.current) setError('Enter a table number for dine-in orders.');
          return;
        }
      }
      if (isNaN(tableNum) || tableNum < 1 || tableNum > 15) {
        if (isMounted.current) setError('Table number must be between 1 and 15.');
        return;
      }
    }

    if (isMounted.current) setSubmitting(true);
    try {
      const order = await api.createOrder({
        order_type: orderType,
        table_number: tableNumber.trim(),
        items: cart
      });
      if (isMounted.current) {
        setLastOrder(order);
        setCart([]);
        setTableNumber('');
        setShowInlineTableInput(false);
        const timer = setTimeout(() => {
          if (isMounted.current) setLastOrder(null);
        }, 2000);
        activeTimers.current.push(timer);
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  }

  function handleOpenAddItemModal(order) {
    setActiveOrderEditing(order);
    setSelectedModalItem(null);
    setSelectedModalPortion('Full');
    setSelectedModalQuantity(1);
    setSelectedModalOrderType(order.order_type);
  }

  function handleCloseAddItemModal() {
    setActiveOrderEditing(null);
    setSelectedModalItem(null);
    setSelectedModalPortion('Full');
    setSelectedModalQuantity(1);
  }

  function handleSelectModalItem(item) {
    setSelectedModalItem(item);
    if (item.fullPrice > 0) {
      setSelectedModalPortion('Full');
    } else if (item.halfPrice > 0) {
      setSelectedModalPortion('Half');
    } else {
      setSelectedModalPortion('Full');
    }
    setSelectedModalQuantity(1);
  }

  async function handleSaveAddItem() {
    if (!activeOrderEditing || !selectedModalItem) return;

    const unitPrice = selectedModalPortion === 'Half' ? selectedModalItem.halfPrice : selectedModalItem.fullPrice;
    const itemPayload = {
      item_name: selectedModalItem.name,
      portion: selectedModalPortion,
      quantity: selectedModalQuantity,
      unit_price: unitPrice,
      total_price: selectedModalQuantity * unitPrice,
      order_type: selectedModalOrderType
    };

    const orderId = activeOrderEditing.id;
    try {
      await api.addOrderItem(orderId, itemPayload);
      if (isMounted.current) {
        handleCloseAddItemModal();
        // Reopen the token card popup so user can continue managing the order
        setExpandedOrderId(orderId);
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  }

  function handleOpenRemoveItemModal(order) {
    setActiveOrderRemoving(order);
    setSelectedItemsToRemove(new Set());
    setRemoveError('');
  }

  function handleCloseRemoveItemModal() {
    setActiveOrderRemoving(null);
    setSelectedItemsToRemove(new Set());
    setRemoveError('');
  }

  async function handleRemoveItemSubmit() {
    if (selectedItemsToRemove.size === 0) {
      if (isMounted.current) setRemoveError('Please select at least one item to remove.');
      return;
    }

    const selectedIds = [...selectedItemsToRemove];
    const remainingCount = activeOrderRemoving.items.length - selectedIds.length;

    const confirmMsg = remainingCount === 0
      ? `This will remove all ${selectedIds.length} item(s) and make the order empty. Continue?`
      : `Remove ${selectedIds.length} selected item(s)?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      for (const itemId of selectedIds) {
        await api.removeOrderItem(activeOrderRemoving.id, itemId);
      }
      const orderId = activeOrderRemoving.id;
      if (isMounted.current) {
        handleCloseRemoveItemModal();
        setExpandedOrderId(orderId);
      }
    } catch (err) {
      if (isMounted.current) setRemoveError(err.message);
    }
  }

  const counts = useMemo(() => {
    return {
      ALL: activeOrders.length,
      PENDING: activeOrders.filter(o => o.status === 'PENDING').length,
      COOKING: activeOrders.filter(o => o.status === 'COOKING').length,
      READY: activeOrders.filter(o => o.status === 'READY').length
    };
  }, [activeOrders]);

  const filteredActiveOrders = useMemo(() => {
    if (selectedFilter === 'ALL') return activeOrders;
    return activeOrders.filter(o => o.status === selectedFilter);
  }, [activeOrders, selectedFilter]);

  // Tab state for cashier screen: 'new-order' | 'active-orders'
  const [cashierTab, setCashierTab] = useState('new-order');
  const [cashierTabDir, setCashierTabDir] = useState('none');

  function switchCashierTab(tab) {
    if (tab === cashierTab) return;
    setCashierTabDir(tab === 'active-orders' ? 'right' : 'left');
    setCashierTab(tab);
  }

  return (
    <main className="page cashier-page">
      <PageHeader title="Cashier" connected={connected} />

      {/* Ready for pickup banner — always visible above tabs */}
      {readyOrders.length > 0 && (
        <section className="panel ready-alert">
          <h2>Ready for pickup</h2>
          <div className="ready-token-row">
            {readyOrders.map((order) => <span key={order.id}>Token #{order.token_number}</span>)}
          </div>
        </section>
      )}

      {/* ── Cashier Tab Nav Wrapper ── */}
      <div className="cashier-tab-nav-sticky-wrapper">
        {/* ── Cashier Tab Nav ── */}
        <div className="kitchen-tab-nav cashier-tab-nav" role="tablist">
          <button
            role="tab"
            aria-selected={cashierTab === 'new-order'}
            className={`kitchen-tab-btn ${cashierTab === 'new-order' ? 'ktab-active' : ''}`}
            onClick={() => switchCashierTab('new-order')}
            id="ctab-new-order"
          >
            <span className="ktab-icon">🛒</span>
            <span>New Order</span>
            {cart.length > 0 && (
              <span className="ktab-badge">{cart.length}</span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={cashierTab === 'active-orders'}
            className={`kitchen-tab-btn ${cashierTab === 'active-orders' ? 'ktab-active' : ''}`}
            onClick={() => switchCashierTab('active-orders')}
            id="ctab-active-orders"
          >
            <span className="ktab-icon">📋</span>
            <span>Active Orders</span>
            {activeOrders.length > 0 && (
              <span className="ktab-badge">{activeOrders.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="kitchen-tab-content-wrap cashier-tab-content-wrap" aria-live="polite">

        {/* ─── Tab 1: New Order ─── */}
        <div
          role="tabpanel"
          aria-labelledby="ctab-new-order"
          className={`kitchen-tab-panel ${
            cashierTab === 'new-order'
              ? 'ktab-panel-visible'
              : cashierTabDir === 'right'
              ? 'ktab-panel-exit-left'
              : 'ktab-panel-hidden-right'
          }`}
        >
          <form className="cashier-layout" onSubmit={submitOrder}>
            {/* Step 1: Order Type */}
            <section className="panel" style={{ border: '2px solid #000000' }}>
              <h2>1. Order type</h2>
              <div className="segmented-control">
                <button type="button" className={orderType === 'DINE_IN' ? 'active' : ''} onClick={() => setOrderType('DINE_IN')}>Dine In</button>
                <button type="button" className={orderType === 'PARCEL' ? 'active' : ''} onClick={() => {
                  setOrderType('PARCEL');
                  setShowInlineTableInput(false);
                  setTableNumber('');
                }}>Parcel</button>
              </div>
              {orderType === 'DINE_IN' && (
                <label className="field-label">
                  Table number
                  <input
                    type="text"
                    pattern="[0-9]*"
                    value={tableNumber}
                    onChange={handleTableNumberChange}
                    placeholder="1 to 15"
                    inputMode="numeric"
                  />
                </label>
              )}
            </section>

            {/* Step 2: Add Items */}
            <section className="panel menu-panel" style={{ border: '2px solid #000000' }}>
              <h2>2. Add items</h2>
              <div className="menu-grid" style={{ maxHeight: '450px', overflowY: 'auto', padding: '0.5rem', border: '2px solid #000000', borderRadius: '1rem', background: '#ffffff' }}>
                {sortedMenu.map((item) => (
                  <button
                    type="button"
                    key={item.name}
                    className={`menu-item-card ${item.available ? 'item-available' : 'item-unavailable'}`}
                    onClick={() => handleMenuClick(item)}
                    disabled={!item.available}
                  >
                    <span className="item-title">{item.name}</span>
                    {!item.available && <span className="unavailable-badge">Out of Stock</span>}
                  </button>
                ))}
              </div>
            </section>

            {/* Step 3: Current Order Summary */}
            <section className="panel cart-panel" style={{ border: '2px solid #000000' }}>
              <h2>3. Current order</h2>
              {cart.length === 0 ? <p className="empty-state">Tap menu items to add them.</p> : (
                <>
                  <ul className="cart-list">
                    {cart.map((item) => (
                      <li key={`${item.item_name}-${item.portion}`} className="cart-item-row">
                        <div className="cart-item-meta">
                          <span className="cart-item-name">{item.item_name}</span>
                          <span className="cart-item-portion">{item.portion}</span>
                          <span className="cart-item-unit">₹{item.unit_price} each</span>
                        </div>
                        <div className="cart-item-controls">
                          <div className="qty-controls">
                            <button type="button" onClick={() => changeQuantity(item.item_name, item.portion, -1)}>-</button>
                            <strong>{item.quantity}</strong>
                            <button type="button" onClick={() => changeQuantity(item.item_name, item.portion, 1)}>+</button>
                          </div>
                          <span className="cart-item-subtotal">₹{item.total_price}</span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="cart-summary-total">
                    <span>Total Items: <strong>{totalItems}</strong></span>
                    <span>Bill Amount: <strong>₹{billAmount}</strong></span>
                  </div>
                </>
              )}
              {cart.length > 0 && orderType === 'DINE_IN' && showInlineTableInput && (
                <div style={{
                  background: '#fff7ed',
                  border: '1.5px dashed var(--amber)',
                  borderRadius: '1rem',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  animation: 'fadeIn 0.2s ease-out',
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.05)'
                }}>
                  <label style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>🪑</span> Enter Table Number:
                  </label>
                  <input
                    type="text"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="Table 1 to 15"
                    value={tableNumber}
                    onChange={handleTableNumberChange}
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.9rem',
                      borderRadius: '0.75rem',
                      border: '1px solid var(--amber)',
                      fontWeight: 900,
                      background: '#ffffff',
                      fontSize: '1.05rem',
                      outline: 'none',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
                    }}
                    autoFocus
                  />
                </div>
              )}
              <ErrorMessage message={error} />
              <button className="primary-action" type="submit" disabled={submitting || cart.length === 0}>
                {submitting ? 'Generating...' : `Generate order (₹${billAmount})`}
              </button>
            </section>
          </form>
        </div>

        {/* ─── Tab 2: Active Orders ─── */}
        <div
          role="tabpanel"
          aria-labelledby="ctab-active-orders"
          className={`kitchen-tab-panel ${
            cashierTab === 'active-orders'
              ? 'ktab-panel-visible'
              : cashierTabDir === 'left'
              ? 'ktab-panel-exit-right'
              : 'ktab-panel-hidden-left'
          }`}
        >
          <section className="panel cashier-active-orders-panel" style={{ border: '2px solid #000000' }}>
            <div className="section-title-row" style={{ marginBottom: '1.25rem' }}>
              <h2>Active Orders</h2>
            </div>

            {activeOrders.length === 0 ? (
              <div className="kitchen-tab-empty" style={{ border: '2px solid #000000' }}>
                <span className="kitchen-tab-empty-icon">📋</span>
                <p>No active orders at the moment.</p>
              </div>
            ) : (
              <div className="active-orders-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem', border: '2px solid #000000', borderRadius: '1.25rem', background: '#ffffff' }}>
                {activeOrders.map((order) => {
                  const totalAmount = order.items ? order.items.reduce((sum, item) => sum + (item.total_price || 0), 0) : 0;
                  const itemCount = order.items ? order.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

                  const statusColors = {
                    PENDING: { color: 'var(--amber)', border: 'var(--amber)', bg: '#fff7ed' },
                    COOKING: { color: 'var(--blue)', border: 'var(--blue)', bg: '#eff6ff' },
                    READY: { color: 'var(--green)', border: 'var(--green)', bg: '#ecfdf5' },
                    DELIVERED: { color: 'var(--muted)', border: 'var(--muted)', bg: '#f4f4f5' },
                    COMPLETED: { color: 'var(--muted)', border: 'var(--muted)', bg: '#f4f4f5' }
                  };
                  const theme = statusColors[order.status.toUpperCase()] || statusColors.PENDING;

                  return (
                    <div
                      key={order.id}
                      style={{
                        border: '1px solid var(--line)',
                        borderLeft: `5px solid ${theme.border}`,
                        borderRadius: '0.85rem',
                        background: '#ffffff',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease-in-out'
                      }}
                    >
                      {/* Collapsed Header Bar / Tap Area */}
                      <div
                        onClick={() => toggleOrderExpand(order.id)}
                        style={{
                          padding: '0.85rem 1.25rem',
                          display: 'flex',
                          flexDirection: 'row',
                          flexWrap: 'nowrap',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          background: '#ffffff',
                          userSelect: 'none',
                          gap: '0.75rem',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      >
                        {/* Left: Token & Table */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--ink)' }}>
                            #{order.token_number}
                          </span>
                          <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            color: 'var(--muted)',
                            whiteSpace: 'nowrap'
                          }}>
                            {order.order_type === 'DINE_IN' ? `Table ${order.table_number}` : 'Parcel'}
                          </span>
                        </div>

                        {/* Middle: Items count */}
                        <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                          </span>
                        </div>

                        {/* Right: Price & Arrow */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--primary-dark)', whiteSpace: 'nowrap' }}>
                            ₹{totalAmount}
                          </span>
                          <span style={{
                            fontSize: '0.85rem',
                            fontWeight: '900',
                            color: 'var(--muted)',
                            display: 'inline-block',
                            flexShrink: 0
                          }}>
                            ▼
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Add Item to Existing Order Modal */}
      {activeOrderEditing && (
        <div className="modal-overlay" onClick={handleCloseAddItemModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', padding: '1rem', gap: '0.75rem' }}>
            <header className="modal-header" style={{ paddingBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', margin: 0 }}>Add Item — Token #{activeOrderEditing.token_number}</h2>
              <button type="button" className="btn-close-modal" onClick={handleCloseAddItemModal}>×</button>
            </header>
            
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '0.25rem 0' }}>
              <div style={{ marginBottom: '0.85rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--line)' }}>
                <strong style={{ fontSize: '1rem', color: 'var(--ink)' }}>
                  {activeOrderEditing.order_type === 'DINE_IN' ? `Table ${activeOrderEditing.table_number}` : 'Parcel'}
                </strong>
              </div>

              {/* Step A: Select Item */}
              <div style={{ marginBottom: '0.85rem' }}>
                <span className="selector-label" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem' }}>Select Item:</span>
                <div className="menu-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', maxHeight: '260px', overflowY: 'auto', border: '2px solid #000000', borderRadius: '0.8rem', padding: '0.4rem', background: '#fff' }}>
                  {sortedMenu.map((item) => (
                    <button
                      type="button"
                      key={item.name}
                      className={`menu-item-card ${item.available ? 'item-available' : 'item-unavailable'} ${selectedModalItem?.name === item.name ? 'selected-item' : ''}`}
                      style={{ minHeight: '3.5rem !important', ...(selectedModalItem?.name === item.name ? { borderColor: 'var(--primary)', background: '#fff5f5' } : {}) }}
                      onClick={() => handleSelectModalItem(item)}
                      disabled={!item.available}
                    >
                      <span className="item-title" style={{ fontSize: '0.78rem' }}>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step B: Portion & Quantity Selectors */}
              {selectedModalItem && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', animation: 'fadeIn 0.2s ease-out' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                    <span className="selector-label" style={{ fontSize: '0.8rem', flexShrink: 0 }}>Portion:</span>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      {selectedModalItem.halfPrice > 0 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '800', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input type="radio" name="modalPortion" value="Half" checked={selectedModalPortion === 'Half'} onChange={() => setSelectedModalPortion('Half')} style={{ width: 'auto', margin: 0 }} />
                          Half (₹{selectedModalItem.halfPrice})
                        </label>
                      )}
                      {selectedModalItem.fullPrice > 0 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '800', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input type="radio" name="modalPortion" value="Full" checked={selectedModalPortion === 'Full'} onChange={() => setSelectedModalPortion('Full')} style={{ width: 'auto', margin: 0 }} />
                          Full (₹{selectedModalItem.fullPrice})
                        </label>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                    <span className="selector-label" style={{ fontSize: '0.8rem', flexShrink: 0 }}>Type:</span>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '800', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input type="radio" name="modalOrderType" value="DINE_IN" checked={selectedModalOrderType === 'DINE_IN'} onChange={() => setSelectedModalOrderType('DINE_IN')} style={{ width: 'auto', margin: 0 }} />
                        Dine In
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '800', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input type="radio" name="modalOrderType" value="PARCEL" checked={selectedModalOrderType === 'PARCEL'} onChange={() => setSelectedModalOrderType('PARCEL')} style={{ width: 'auto', margin: 0 }} />
                        Parcel
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="selector-label" style={{ fontSize: '0.8rem' }}>Qty:</span>
                    <div className="qty-controls modal-qty-controls">
                      <button type="button" disabled={selectedModalQuantity <= 1} onClick={() => setSelectedModalQuantity(q => q - 1)}>-</button>
                      <strong>{selectedModalQuantity}</strong>
                      <button type="button" onClick={() => setSelectedModalQuantity(q => q + 1)}>+</button>
                    </div>
                  </div>

                  <div className="modal-total-bar" style={{ padding: '0.65rem 0.9rem', fontSize: '1rem' }}>
                    <span>Total:</span>
                    <strong>₹{((selectedModalPortion === 'Half' ? selectedModalItem.halfPrice : selectedModalItem.fullPrice) * selectedModalQuantity)}</strong>
                  </div>
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button type="button" className="btn-cancel" onClick={handleCloseAddItemModal}>Cancel</button>
              <button
                type="button"
                className="primary-action btn-confirm-add"
                onClick={handleSaveAddItem}
                disabled={!selectedModalItem}
              >
                Save
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Remove Item Modal */}
      {activeOrderRemoving && (
        <div className="modal-overlay" onClick={handleCloseRemoveItemModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <header className="modal-header">
              <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Remove Items — Token #{activeOrderRemoving.token_number}</h2>
              <button type="button" className="btn-close-modal" onClick={handleCloseRemoveItemModal}>×</button>
            </header>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem 0' }}>
              {removeError && <div className="error-message">{removeError}</div>}
              
              <p style={{ margin: 0, fontWeight: 800, color: 'var(--muted)', fontSize: '0.85rem' }}>
                Select items to remove ({selectedItemsToRemove.size} selected):
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
                {activeOrderRemoving.items.map((item) => {
                  const isSelectable = !(item.status === 'COOKING' || item.status === 'READY' || item.status === 'SERVED');
                  const isChecked = selectedItemsToRemove.has(item.id);
                  return (
                    <label 
                      key={item.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem', 
                        padding: '0.65rem 1rem', 
                        borderRadius: '0.8rem', 
                        border: `1.5px solid ${isChecked ? 'var(--primary)' : 'var(--line)'}`, 
                        background: isChecked ? '#fdf8f7' : isSelectable ? 'white' : '#f5f5f5', 
                        cursor: isSelectable ? 'pointer' : 'not-allowed',
                        opacity: isSelectable ? 1 : 0.55,
                        fontWeight: '800',
                        transition: 'border-color 0.15s ease, background 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        value={item.id}
                        disabled={!isSelectable}
                        checked={isChecked}
                        onChange={() => {
                          setRemoveError('');
                          setSelectedItemsToRemove(prev => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }}
                        style={{ width: '1.1rem', height: '1.1rem', margin: 0, accentColor: 'var(--primary)', cursor: isSelectable ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                        <span style={{ fontSize: '0.95rem', color: isSelectable ? 'var(--ink)' : 'var(--muted)' }}>
                          {item.portion || 'Full'} {item.item_name} ×{item.quantity}
                        </span>
                        {!isSelectable && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 900, textTransform: 'uppercase', marginTop: '0.1rem' }}>
                            {item.status === 'COOKING' ? '🍳 Being Prepared' : item.status === 'READY' ? '🟢 Ready' : '🍽 Served'}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <footer className="modal-footer">
              <button type="button" className="btn-cancel" onClick={handleCloseRemoveItemModal}>Cancel</button>
              <button
                type="button"
                className="primary-action"
                style={{
                  background: selectedItemsToRemove.size > 0 ? 'var(--primary)' : '#ccc',
                  color: 'white',
                  border: 0,
                  borderRadius: '0.8rem',
                  fontWeight: '900',
                  padding: '0.8rem 1.5rem',
                  cursor: selectedItemsToRemove.size > 0 ? 'pointer' : 'not-allowed',
                  marginTop: 0
                }}
                onClick={handleRemoveItemSubmit}
                disabled={selectedItemsToRemove.size === 0}
              >
                Remove {selectedItemsToRemove.size > 0 ? `(${selectedItemsToRemove.size})` : ''}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Portion Selection Modal */}
      {activeModalItem && (
        <div className="modal-overlay" onClick={() => setActiveModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>Select Portion & Quantity</h2>
              <button type="button" className="btn-close-modal" onClick={() => setActiveModalItem(null)}>×</button>
            </header>
            
            <div className="modal-body">
              <h3 className="modal-item-title">{activeModalItem.name}</h3>
              
              <div className="portion-selector-row">
                <span className="selector-label">Portion:</span>
                <div className="portion-options">
                  {activeModalItem.halfPrice > 0 && (
                    <button
                      type="button"
                      className={`portion-btn ${selectedPortion === 'Half' ? 'selected' : ''}`}
                      onClick={() => setSelectedPortion('Half')}
                    >
                      Half Plate (₹{activeModalItem.halfPrice})
                    </button>
                  )}
                  {activeModalItem.fullPrice > 0 && (
                    <button
                      type="button"
                      className={`portion-btn ${selectedPortion === 'Full' ? 'selected' : ''}`}
                      onClick={() => setSelectedPortion('Full')}
                    >
                      Full Plate (₹{activeModalItem.fullPrice})
                    </button>
                  )}
                </div>
              </div>

              <div className="quantity-selector-row">
                <span className="selector-label">Quantity:</span>
                <div className="qty-controls modal-qty-controls">
                  <button type="button" disabled={selectedQuantity <= 1} onClick={() => setSelectedQuantity(q => q - 1)}>-</button>
                  <strong>{selectedQuantity}</strong>
                  <button type="button" onClick={() => setSelectedQuantity(q => q + 1)}>+</button>
                </div>
              </div>

              <div className="modal-total-bar">
                <span>Portion Total:</span>
                <strong>₹{((selectedPortion === 'Half' ? activeModalItem.halfPrice : activeModalItem.fullPrice) * selectedQuantity)}</strong>
              </div>
            </div>

            <footer className="modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setActiveModalItem(null)}>Cancel</button>
              <button type="button" className="primary-action btn-confirm-add" onClick={addToCart}>
                Add to Cart
              </button>
            </footer>
          </div>
        </div>
      )}

      {lastOrder && (
        <div className="cashier-toast">
          <span className="toast-icon">✓</span>
          <div>
            <strong>Order Created</strong>
            <span className="toast-meta">
              Token #{lastOrder.token_number}&nbsp;•&nbsp;{lastOrder.order_type === 'DINE_IN' ? `Table ${lastOrder.table_number}` : 'Parcel'}
            </span>
          </div>
        </div>
      )}

      {/* Popup Order Card Details Modal */}
      {expandedOrderId && (() => {
        const popupOrder = activeOrders.find(o => o.id === expandedOrderId);
        if (!popupOrder) return null;
        return (
          <div className="modal-overlay" onClick={() => setExpandedOrderId(null)}>
            <div 
              className="modal-content" 
              style={{ 
                width: '98%',
                maxWidth: '440px', 
                margin: '0 auto',
                padding: '1.25rem', 
                overflow: 'hidden', 
                borderRadius: '1.5rem', 
                background: 'var(--card)',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.25)',
                border: '2px solid #000000',
                boxSizing: 'border-box'
              }} 
              onClick={(e) => e.stopPropagation()}
            >
              <header className="modal-header" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--muted)' }}>Order Details</h2>
                <button 
                  type="button" 
                  className="btn-close-modal" 
                  style={{ 
                    background: 'transparent', 
                    border: 0, 
                    fontSize: '1.8rem', 
                    lineHeight: 1, 
                    cursor: 'pointer', 
                    color: 'var(--muted)',
                    padding: '0 0.5rem'
                  }} 
                  onClick={() => setExpandedOrderId(null)}
                >
                  ×
                </button>
              </header>
              <div style={{ padding: '0.5rem 1% 0 1%' }}>
                <OrderCard
                  order={popupOrder}
                  onAddItem={(ord) => {
                    setExpandedOrderId(null);
                    handleOpenAddItemModal(ord);
                  }}
                  onRemoveItem={(ord) => {
                    setExpandedOrderId(null);
                    handleOpenRemoveItemModal(ord);
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
