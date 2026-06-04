import { useState, useEffect, useMemo, useRef } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { api } from '../services/api.js';
import { supabase } from '../lib/supabase.js';

const DEFAULT_CATEGORIES = ['NOODLES', 'RICE', 'BURGERS', 'SHAKES', 'FRIES', 'MOMOS', 'MANCHURIAN', 'OTHERS'];
const DEFAULT_FILTER_CHIPS = ['All', 'NOODLES', 'RICE', 'BURGERS', 'MOMOS', 'MANCHURIAN', 'SHAKES', 'FRIES', 'OTHERS'];

const CATEGORY_EMOJIS = {
  NOODLES: '🍜',
  RICE: '🍚',
  BURGERS: '🍔',
  SHAKES: '🥤',
  FRIES: '🍟',
  MOMOS: '🥟',
  MANCHURIAN: '🥘',
  OTHERS: '🍽️',
};

// ── Custom Category Picker ───────────────────────────────────────
function CategoryPicker({ value, onChange, allCategories, onAddCategory }) {
  const [open, setOpen] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('🍽️');
  const newCatRef = useRef(null);

  function handleSelect(cat) {
    onChange(cat);
    setOpen(false);
    setCreatingNew(false);
  }

  function handleAddCategory(e) {
    e.preventDefault();
    const trimmed = newCatName.trim().toUpperCase();
    if (!trimmed) return;
    onAddCategory(trimmed, newCatEmoji);
    onChange(trimmed);
    setNewCatName('');
    setNewCatEmoji('🍽️');
    setCreatingNew(false);
    setOpen(false);
  }

  const displayEmoji = CATEGORY_EMOJIS[value] || '🍽️';

  return (
    <div className="cat-picker-wrap">
      {/* Trigger button */}
      <button
        type="button"
        className={`cat-picker-trigger ${open ? 'cat-picker-open' : ''}`}
        onClick={() => { setOpen((o) => !o); setCreatingNew(false); }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cat-picker-value">
          <span>{displayEmoji}</span>
          <strong>{value}</strong>
        </span>
        <span className={`cat-picker-chevron ${open ? 'chevron-up' : ''}`}>▾</span>
      </button>

      {/* Inline dropdown panel — rendered INSIDE modal, no overflow */}
      {open && (
        <div className="cat-picker-panel" role="listbox">
          <div className="cat-picker-list">
            {allCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                role="option"
                aria-selected={cat === value}
                className={`cat-picker-option ${cat === value ? 'cat-option-selected' : ''}`}
                onClick={() => handleSelect(cat)}
              >
                <span className="cat-option-emoji">{CATEGORY_EMOJIS[cat] || '🍽️'}</span>
                <span className="cat-option-name">{cat}</span>
                {cat === value && <span className="cat-option-check">✓</span>}
              </button>
            ))}
          </div>

          {/* Divider + Create new */}
          <div className="cat-picker-divider" />
          {!creatingNew ? (
            <button
              type="button"
              className="cat-create-btn"
              onClick={() => { setCreatingNew(true); setTimeout(() => newCatRef.current?.focus(), 50); }}
            >
              <span>＋</span> Create new category
            </button>
          ) : (
            <form className="cat-create-form" onSubmit={handleAddCategory}>
              <div className="cat-create-row">
                <input
                  ref={newCatRef}
                  className="cat-create-emoji-input"
                  type="text"
                  value={newCatEmoji}
                  onChange={(e) => setNewCatEmoji(e.target.value)}
                  placeholder="🍽️"
                  maxLength={2}
                  aria-label="Emoji"
                />
                <input
                  className="cat-create-name-input"
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Category name…"
                  maxLength={20}
                  aria-label="Category name"
                  required
                />
              </div>
              <div className="cat-create-actions">
                <button type="button" className="cat-create-cancel" onClick={() => setCreatingNew(false)}>Cancel</button>
                <button type="submit" className="cat-create-save">Add</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── Toggle Switch Component ──────────────────────────────────────
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`menu-toggle-switch ${checked ? 'toggle-on' : 'toggle-off'}`}
      onClick={onChange}
    >
      <span className="toggle-knob" />
      <span className="toggle-label">{checked ? 'In Stock' : 'Out of Stock'}</span>
    </button>
  );
}

// ── Dish Modal (Add / Edit) ──────────────────────────────────────
function DishModal({ mode, item, onClose, onSave, saving, existingNames, allCategories, onAddCategory }) {
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || 'OTHERS');
  const [halfPrice, setHalfPrice] = useState(item?.halfPrice || '');
  const [fullPrice, setFullPrice] = useState(item?.fullPrice || '');
  const [available, setAvailable] = useState(item?.available ?? true);
  const [localError, setLocalError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    setLocalError('');
    const trimmed = name.trim();
    if (!trimmed) { setLocalError('Dish name is required.'); return; }
    if (
      mode === 'add' &&
      existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())
    ) {
      setLocalError(`"${trimmed}" already exists.`);
      return;
    }
    const half = parseFloat(halfPrice) || 0;
    const full = parseFloat(fullPrice) || 0;
    if (half < 0 || full < 0) { setLocalError('Prices cannot be negative.'); return; }
    onSave({ name: trimmed, category, halfPrice: half, fullPrice: full, available });
  }

  return (
    <div className="menu-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="menu-modal-sheet" role="dialog" aria-modal="true">
        <div className="menu-modal-handle" />
        <div className="menu-modal-header">
          <h2>{mode === 'add' ? '➕ Add New Dish' : '✏️ Edit Dish'}</h2>
          <button type="button" className="menu-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {localError && <div className="menu-inline-error">{localError}</div>}

        <form onSubmit={handleSubmit} className="menu-modal-form">
          <label className="menu-modal-label">
            Dish Name
            <input
              type="text"
              placeholder="e.g. Schezwan Noodles"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={mode === 'edit'}
              className="menu-modal-input"
            />
          </label>

          <div className="menu-modal-label">
            Category
            <CategoryPicker
              value={category}
              onChange={setCategory}
              allCategories={allCategories}
              onAddCategory={onAddCategory}
            />
          </div>

          <div className="menu-modal-price-row">
            <label className="menu-modal-label">
              Half Price (₹)
              <div className="menu-price-input-wrap">
                <span>₹</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={halfPrice}
                  onChange={(e) => setHalfPrice(e.target.value)}
                  className="menu-modal-input"
                />
              </div>
            </label>
            <label className="menu-modal-label">
              Full Price (₹)
              <div className="menu-price-input-wrap">
                <span>₹</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={fullPrice}
                  onChange={(e) => setFullPrice(e.target.value)}
                  className="menu-modal-input"
                />
              </div>
            </label>
          </div>

          <div className="menu-modal-toggle-row">
            <span className="menu-modal-label" style={{ marginBottom: 0 }}>Availability</span>
            <ToggleSwitch checked={available} onChange={() => setAvailable((v) => !v)} />
          </div>

          <div className="menu-modal-footer">
            <button type="button" className="menu-modal-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="menu-modal-save-btn" disabled={saving}>
              {saving ? 'Saving…' : mode === 'add' ? 'Add Dish' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Menu Item Card (Mobile) ──────────────────────────────────────
function MenuItemCard({ item, onToggle, onEdit, onDelete, saving }) {
  return (
    <div className={`menu-item-mobile-card ${!item.available ? 'card-unavailable' : ''}`}>
      <div className="card-top-row">
        <div className="card-name-wrap">
          <span className="card-category-emoji">{CATEGORY_EMOJIS[item.category] || '🍽️'}</span>
          <div>
            <p className="card-dish-name">{item.name}</p>
            <span className="card-category-chip">{item.category || 'OTHERS'}</span>
          </div>
        </div>
        <div className="card-action-btns">
          <button
            type="button"
            className="card-edit-btn"
            onClick={() => onEdit(item)}
            aria-label={`Edit ${item.name}`}
          >
            ✏️
          </button>
          <button
            type="button"
            className="card-delete-btn"
            onClick={() => onDelete(item.name)}
            aria-label={`Delete ${item.name}`}
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="card-price-row">
        <div className="card-price-box">
          <span className="card-price-label">Half</span>
          <span className="card-price-value">
            {item.halfPrice > 0 ? `₹${item.halfPrice}` : '—'}
          </span>
        </div>
        <div className="card-price-divider" />
        <div className="card-price-box">
          <span className="card-price-label">Full</span>
          <span className="card-price-value">
            {item.fullPrice > 0 ? `₹${item.fullPrice}` : '—'}
          </span>
        </div>
        <div className="card-toggle-wrap">
          <ToggleSwitch
            checked={item.available}
            onChange={() => onToggle(item.name)}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main MenuPage Component ──────────────────────────────────────
export default function MenuPage() {
  const isMounted = useRef(true);
  const activeTimers = useRef(new Set());

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      activeTimers.current.forEach(clearTimeout);
    };
  }, []);

  const [items, setItems] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Search & filter
  // Custom categories (user-created)
  const [customCategories, setCustomCategories] = useState([]);

  // All categories = defaults + custom (deduplicated)
  const allCategories = useMemo(() => {
    const combined = [...DEFAULT_CATEGORIES];
    customCategories.forEach((c) => { if (!combined.includes(c)) combined.push(c); });
    return combined;
  }, [customCategories]);

  // Filter chips = All + allCategories
  const filterChips = useMemo(() => ['All', ...allCategories], [allCategories]);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState(null); // null = closed, item obj = open

  // Desktop form states (for desktop view)
  const [newName, setNewName] = useState('');
  const [newHalfPrice, setNewHalfPrice] = useState('');
  const [newFullPrice, setNewFullPrice] = useState('');
  const [newAvailable, setNewAvailable] = useState(true);
  const [newCategory, setNewCategory] = useState('OTHERS');

  useEffect(() => {
    api.getMenu()
      .then((data) => {
        if (isMounted.current) setItems(data.items);
      })
      .catch((err) => {
        if (isMounted.current) setError(err.message);
      });

    if (isMounted.current) setConnected(true);

    const channel = supabase
      .channel('menu-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, async () => {
        try {
          const data = await api.getMenu();
          if (isMounted.current) setItems(data.items);
        } catch (err) {
          console.error('Realtime menu reload error:', err);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter + search
  const filteredItems = useMemo(() => {
    let list = items;
    if (activeFilter !== 'All') {
      list = list.filter((item) => (item.category || 'OTHERS') === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, activeFilter, searchQuery]);

  // Desktop: grouped items
  const groupedItems = useMemo(() => {
    const groups = {};
    items.forEach((item) => {
      const cat = item.category || 'OTHERS';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [items]);

  async function handleSave(updatedItems) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.saveMenu(updatedItems);
      if (isMounted.current) {
        setItems(res.items);
        setSuccess('Menu saved!');
        const timer = setTimeout(() => {
          if (isMounted.current) setSuccess('');
          activeTimers.current.delete(timer);
        }, 3000);
        activeTimers.current.add(timer);
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }

  function handleFieldChange(itemName, field, value) {
    setItems((prev) =>
      prev.map((item) => (item.name !== itemName ? item : { ...item, [field]: value }))
    );
  }

  function handleToggleAvailable(itemName) {
    const updated = items.map((item) =>
      item.name !== itemName ? item : { ...item, available: !item.available }
    );
    handleSave(updated);
  }

  function handleRemoveItem(itemName) {
    if (!window.confirm(`Remove "${itemName}" from the menu?`)) return;
    handleSave(items.filter((item) => item.name !== itemName));
  }

  function handleAddCategory(catName, emoji) {
    setCustomCategories((prev) => {
      if (prev.includes(catName)) return prev;
      return [...prev, catName];
    });
    // Also store emoji in our local map
    CATEGORY_EMOJIS[catName] = emoji;
  }

  // Modal save handler (both add & edit)
  async function handleModalSave(data) {
    setError('');
    if (editItem) {
      // Edit mode
      const updated = items.map((item) =>
        item.name !== editItem.name ? item : { ...item, ...data, name: editItem.name }
      );
      await handleSave(updated);
      if (isMounted.current) setEditItem(null);
    } else {
      // Add mode
      const updated = [...items, data];
      setSaving(true);
      try {
        const res = await api.saveMenu(updated);
        if (isMounted.current) {
          setItems(res.items);
          setSuccess(`"${data.name}" added!`);
          const timer = setTimeout(() => {
            if (isMounted.current) setSuccess('');
            activeTimers.current.delete(timer);
          }, 3000);
          activeTimers.current.add(timer);
          setShowAddModal(false);
        }
      } catch (err) {
        if (isMounted.current) setError(err.message);
      } finally {
        if (isMounted.current) setSaving(false);
      }
    }
  }

  // Desktop add item
  async function handleAddItem(e) {
    e.preventDefault();
    setError('');
    const trimmedName = newName.trim();
    if (!trimmedName) { setError('Item name is required.'); return; }
    if (items.some((item) => item.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError(`"${trimmedName}" already exists.`);
      return;
    }
    const half = parseFloat(newHalfPrice) || 0;
    const full = parseFloat(newFullPrice) || 0;
    if (half < 0 || full < 0) { setError('Prices cannot be negative.'); return; }

    const updated = [...items, { name: trimmedName, halfPrice: half, fullPrice: full, available: newAvailable, category: newCategory }];
    setSaving(true);
    try {
      const res = await api.saveMenu(updated);
      if (isMounted.current) {
        setItems(res.items);
        setSuccess(`"${trimmedName}" added!`);
        setNewName(''); setNewHalfPrice(''); setNewFullPrice(''); setNewAvailable(true); setNewCategory('OTHERS');
        const timer = setTimeout(() => {
          if (isMounted.current) setSuccess('');
          activeTimers.current.delete(timer);
        }, 3000);
        activeTimers.current.add(timer);
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
      }
    } finally {
      if (isMounted.current) {
        setSaving(false);
      }
    }
  }

  return (
    <main className="page menu-page">
      <PageHeader title="Menu Manager" connected={connected} />

      <ErrorMessage message={error} />
      {success && <div className="success-badge">{success}</div>}

      {/* ═══════════════ MOBILE VIEW (< 768px) ═══════════════ */}
      <div className="menu-mobile-view">
        {/* Search Bar */}
        <div className="menu-search-bar-wrap">
          <span className="menu-search-icon">🔍</span>
          <input
            type="search"
            className="menu-search-input"
            placeholder="Search dishes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="menu-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="menu-filter-chips" role="group" aria-label="Category filters">
          {filterChips.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`menu-filter-chip ${activeFilter === chip ? 'chip-active' : ''}`}
              onClick={() => setActiveFilter(chip)}
            >
              {chip !== 'All' && (CATEGORY_EMOJIS[chip] || '🍽️')} {chip === 'All' ? '🍴 All' : chip}
            </button>
          ))}
        </div>

        {/* Item Cards */}
        <div className="menu-cards-list">
          {filteredItems.length === 0 ? (
            <div className="menu-empty-state">
              <span className="menu-empty-icon">🍽️</span>
              <p>{searchQuery || activeFilter !== 'All' ? 'No dishes match your search.' : 'No menu items yet. Tap + to add one.'}</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <MenuItemCard
                key={item.name}
                item={item}
                onToggle={handleToggleAvailable}
                onEdit={(it) => setEditItem(it)}
                onDelete={handleRemoveItem}
                saving={saving}
              />
            ))
          )}
        </div>

        {/* Floating Add Button */}
        <button
          type="button"
          className="menu-fab"
          onClick={() => setShowAddModal(true)}
          aria-label="Add new dish"
        >
          <span className="menu-fab-icon">+</span>
        </button>
      </div>

      {/* ═══════════════ DESKTOP VIEW (≥ 768px) ═══════════════ */}
      <div className="menu-desktop-view">
        <div className="menu-manager-layout">
          {/* Current Items List */}
          <section className="panel menu-list-panel">
            <div className="section-title-row">
              <h2>Active Menu Items ({items.length})</h2>
              <p>Define pricing for plate portions and manage live stock availability.</p>
            </div>

            {items.length === 0 ? (
              <p className="empty-state">No menu items found. Add your first item below.</p>
            ) : (
              Object.entries(groupedItems).map(([categoryName, catItems]) => (
                <div key={categoryName} style={{ marginBottom: '2.5rem' }}>
                  <h3 style={{ background: 'var(--ink)', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '0.75rem', display: 'inline-block', fontSize: '0.85rem', fontWeight: 900, marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {CATEGORY_EMOJIS[categoryName]} {categoryName}
                  </h3>
                  <div className="menu-table-container">
                    <table className="menu-table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>Category</th>
                          <th>Half Price</th>
                          <th>Full Price</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catItems.map((item) => (
                          <tr key={item.name} className={item.available ? '' : 'row-unavailable'}>
                            <td className="cell-name">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleFieldChange(item.name, 'name', e.target.value)}
                              />
                            </td>
                             <td>
                              <select
                                value={item.category || 'OTHERS'}
                                onChange={(e) => handleFieldChange(item.name, 'category', e.target.value)}
                                style={{ padding: '0.4rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontWeight: '800', background: 'white' }}
                              >
                                {allCategories.map((cat) => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </td>
                            <td className="cell-price">
                              <div className="price-input-wrapper">
                                <span>₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.halfPrice || ''}
                                  placeholder="0"
                                  onChange={(e) => handleFieldChange(item.name, 'halfPrice', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </td>
                            <td className="cell-price">
                              <div className="price-input-wrapper">
                                <span>₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.fullPrice || ''}
                                  placeholder="0"
                                  onChange={(e) => handleFieldChange(item.name, 'fullPrice', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`btn-toggle ${item.available ? 'active' : 'inactive'}`}
                                onClick={() => handleToggleAvailable(item.name)}
                              >
                                {item.available ? 'Available' : 'Out of Stock'}
                              </button>
                            </td>
                            <td>
                              <div className="action-row">
                                <button
                                  type="button"
                                  className="btn-save-inline"
                                  disabled={saving}
                                  onClick={() => handleSave(items)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={() => {
                                    if (window.confirm(`Remove ${item.name}?`)) handleRemoveItem(item.name);
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}

            {items.length > 0 && (
              <button
                type="button"
                className="primary-action btn-save-all"
                disabled={saving}
                onClick={() => handleSave(items)}
              >
                {saving ? 'Saving changes…' : 'Save All Pricing Changes'}
              </button>
            )}
          </section>

          {/* Add New Item Panel */}
          <section className="panel add-item-panel">
            <h2>Add New Dish</h2>
            <form onSubmit={handleAddItem} className="add-dish-form">
              <label className="field-label">
                Dish Name
                <input
                  type="text"
                  placeholder="e.g. Schezwan Noodles"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </label>

              <label className="field-label">
                Category
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '1rem', border: '1px solid var(--line)', fontWeight: '800', background: 'white', display: 'block', outline: 'none' }}
                >
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              <div className="form-row-pricing">
                <label className="field-label">
                  Half Plate Price (₹)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 60"
                    value={newHalfPrice}
                    onChange={(e) => setNewHalfPrice(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Full Plate Price (₹)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 100"
                    value={newFullPrice}
                    onChange={(e) => setNewFullPrice(e.target.value)}
                  />
                </label>
              </div>

              <div className="checkbox-wrapper">
                <input
                  type="checkbox"
                  id="newAvailable"
                  checked={newAvailable}
                  onChange={(e) => setNewAvailable(e.target.checked)}
                />
                <label htmlFor="newAvailable">Mark as instantly available</label>
              </div>

              <button type="submit" className="primary-action btn-add-dish" disabled={saving}>
                {saving ? 'Adding…' : 'Add Dish to Menu'}
              </button>
            </form>
          </section>
        </div>
      </div>

      {/* ═══════════════ MODALS ═══════════════ */}
      {showAddModal && (
        <DishModal
          mode="add"
          item={null}
          onClose={() => setShowAddModal(false)}
          onSave={handleModalSave}
          saving={saving}
          existingNames={items.map((i) => i.name)}
          allCategories={allCategories}
          onAddCategory={handleAddCategory}
        />
      )}
      {editItem && (
        <DishModal
          mode="edit"
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={handleModalSave}
          saving={saving}
          existingNames={items.map((i) => i.name)}
          allCategories={allCategories}
          onAddCategory={handleAddCategory}
        />
      )}
    </main>
  );
}
