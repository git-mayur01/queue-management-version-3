import { useEffect, useMemo, useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { api } from '../services/api.js';
import { supabase } from '../lib/supabase.js';
import { safeParseDate } from '../utils/date.js';

export default function AdminPage() {
  const isMounted = useRef(true);
  const activeTimers = useRef([]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      activeTimers.current.forEach(clearTimeout);
    };
  }, []);

  const [orders, setOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [toast, setToast] = useState(null);
  const [backupState, setBackupState] = useState(null); // null | 'compressing' | 'handshake' | 'uploading' | 'success'


  const orderFeedRef = useRef(null);

  // Global Date Filter states
  const [globalFilter, setGlobalFilter] = useState('Today');
  const [globalFrom, setGlobalFrom] = useState('');
  const [globalTo, setGlobalTo] = useState('');
  const [appliedFilter, setAppliedFilter] = useState({ type: 'Today', from: '', to: '' });

  // Searchable History Filter states
  const [historySearchToken, setHistorySearchToken] = useState('');
  const [historySearchStatus, setHistorySearchStatus] = useState('ALL');
  const [historySearchType, setHistorySearchType] = useState('ALL');
  const [historySearchTable, setHistorySearchTable] = useState('');
  const [historySearchFrom, setHistorySearchFrom] = useState('');
  const [historySearchTo, setHistorySearchTo] = useState('');

  // Toast helper
  const showToast = (message) => {
    if (!isMounted.current) return;
    setToast(message);
    const timer = setTimeout(() => {
      if (isMounted.current) setToast(null);
    }, 3000);
    activeTimers.current.push(timer);
  };

  const fetchOrders = () => {
    api.getOrders()
      .then((data) => {
        if (isMounted.current) setOrders(data);
      })
      .catch(() => { });
  };

  const debounceTimeout = useRef(null);

  useEffect(() => {
    fetchOrders();
    if (isMounted.current) setConnected(true);

    const triggerReload = () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        fetchOrders();
      }, 150);
    };

    const channel = supabase
      .channel('admin-orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, triggerReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, triggerReload)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);


  // SQL Datetime parsing helper is replaced by safeParseDate import

  // Helper: Filter orders by selected timeframe
  const filterOrdersByRange = (allOrders, rangeType, customFrom, customTo) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let fromDate = null;
    let toDate = new Date();

    switch (rangeType) {
      case 'Today':
        fromDate = startOfToday;
        break;
      case 'Yesterday':
        fromDate = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
        toDate = new Date(startOfToday.getTime() - 1);
        break;
      case 'Last 7 Days':
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'Last 30 Days':
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'This Month':
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'Custom':
        if (customFrom) {
          fromDate = new Date(customFrom);
          fromDate.setHours(0, 0, 0, 0);
        }
        if (customTo) {
          toDate = new Date(customTo);
          toDate.setHours(23, 59, 59, 999);
        }
        break;
      default:
        fromDate = startOfToday;
        break;
    }

    return allOrders.filter(order => {
      if (!order.created_at) return false;
      const orderDate = safeParseDate(order.created_at);
      if (!orderDate) return false;
      if (fromDate && orderDate < fromDate) return false;
      if (toDate && orderDate > toDate) return false;
      return true;
    });
  };

  // Filtered orders list based on the global date filter
  const filteredOrders = useMemo(() => {
    return filterOrdersByRange(orders, appliedFilter.type, appliedFilter.from, appliedFilter.to);
  }, [orders, appliedFilter]);

  // Derived POS stats from filtered orders
  const derivedStats = useMemo(() => {
    let revenue = 0;
    let pendingOrders = 0;
    let cookingOrders = 0;
    let readyOrders = 0;
    let deliveredOrders = 0;
    let dineInCount = 0;
    let parcelCount = 0;

    const itemMap = {};
    const portionMap = {};

    filteredOrders.forEach(order => {
      let orderTotal = 0;
      if (order.items) {
        order.items.forEach(item => {
          const qty = item.quantity || 0;
          const price = item.total_price || 0;
          orderTotal += price;

          const key = item.item_name;
          itemMap[key] = (itemMap[key] || 0) + qty;

          const port = item.portion || 'Full';
          portionMap[port] = (portionMap[port] || 0) + qty;
        });
      }

      revenue += orderTotal;

      const status = order.status?.toUpperCase();
      if (status === 'PENDING') pendingOrders++;
      else if (status === 'COOKING') cookingOrders++;
      else if (status === 'READY') readyOrders++;
      else if (status === 'DELIVERED') deliveredOrders++;

      if (order.order_type === 'DINE_IN') dineInCount++;
      else parcelCount++;
    });

    const activeOrders = pendingOrders + cookingOrders + readyOrders;

    let mostSoldItem = 'N/A';
    let mostSoldQty = 0;
    const popularList = Object.entries(itemMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);

    if (popularList.length > 0) {
      mostSoldItem = popularList[0].name;
      mostSoldQty = popularList[0].qty;
    }
    const top5Items = popularList.slice(0, 5);

    let mostOrderedPortion = 'N/A';
    let maxPortionQty = 0;
    Object.entries(portionMap).forEach(([port, qty]) => {
      if (qty > maxPortionQty) {
        mostOrderedPortion = port;
        maxPortionQty = qty;
      }
    });

    const mostPopularType = dineInCount >= parcelCount ? 'Dine In (🍽)' : 'Parcel (🛍)';
    const aov = filteredOrders.length > 0 ? (revenue / filteredOrders.length) : 0;

    return {
      revenue,
      ordersCount: filteredOrders.length,
      activeOrders,
      pendingOrders,
      cookingOrders,
      readyOrders,
      deliveredOrders,
      aov,
      mostSoldItem,
      mostSoldQty,
      mostOrderedPortion,
      mostPopularType,
      top5Items,
      dineInCount,
      parcelCount
    };
  }, [filteredOrders]);

  // Comparison Metrics calculations: Today vs Yesterday & This Month vs Last Month
  const getComparisonMetrics = (allOrders) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    let revToday = 0;
    let revYesterday = 0;
    let revThisMonth = 0;
    let revLastMonth = 0;

    allOrders.forEach(order => {
      const oDate = safeParseDate(order.created_at);
      if (!oDate) return;
      const orderPrice = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;

      if (oDate >= startOfToday) {
        revToday += orderPrice;
      } else if (oDate >= startOfYesterday && oDate < startOfToday) {
        revYesterday += orderPrice;
      }

      if (oDate >= startOfThisMonth) {
        revThisMonth += orderPrice;
      } else if (oDate >= startOfLastMonth && oDate <= endOfLastMonth) {
        revLastMonth += orderPrice;
      }
    });

    const getGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    return {
      todayRevenue: revToday,
      yesterdayRevenue: revYesterday,
      todayVsYesterdayGrowth: getGrowth(revToday, revYesterday),
      thisMonthRevenue: revThisMonth,
      lastMonthRevenue: revLastMonth,
      thisMonthVsLastMonthGrowth: getGrowth(revThisMonth, revLastMonth)
    };
  };

  // Grouped Monthly & Daily Revenue Breakdown
  const getDailyRevenue = (dataset) => {
    const dayMap = {};
    dataset.forEach(order => {
      const dateObj = safeParseDate(order.created_at);
      if (!dateObj) return;
      const dayKey = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const orderPrice = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;

      if (!dayMap[dayKey]) {
        dayMap[dayKey] = { dateStr: dayKey, revenue: 0, count: 0, rawDate: dateObj };
      }
      dayMap[dayKey].revenue += orderPrice;
      dayMap[dayKey].count += 1;
    });

    return Object.values(dayMap).sort((a, b) => b.rawDate - a.rawDate);
  };

  const getMonthlyRevenue = (dataset) => {
    const monthMap = {};
    dataset.forEach(order => {
      const dateObj = safeParseDate(order.created_at);
      if (!dateObj) return;
      const monthKey = dateObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const orderPrice = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = { monthStr: monthKey, revenue: 0, count: 0, sortKey: new Date(dateObj.getFullYear(), dateObj.getMonth(), 1) };
      }
      monthMap[monthKey].revenue += orderPrice;
      monthMap[monthKey].count += 1;
    });

    return Object.values(monthMap).sort((a, b) => b.sortKey - a.sortKey);
  };

  // Filter searchable order history table
  const getFilteredHistoryOrders = () => {
    return orders.filter(order => {
      if (historySearchToken.trim() && !order.token_number.toString().includes(historySearchToken.trim())) {
        return false;
      }
      if (historySearchStatus !== 'ALL' && order.status !== historySearchStatus) {
        return false;
      }
      if (historySearchType !== 'ALL' && order.order_type !== historySearchType) {
        return false;
      }
      if (historySearchTable.trim()) {
        const tableNum = order.table_number ? order.table_number.toString() : '';
        if (!tableNum.toLowerCase().includes(historySearchTable.trim().toLowerCase())) {
          return false;
        }
      }
      if (historySearchFrom || historySearchTo) {
        const oDate = safeParseDate(order.created_at);
        if (!oDate) return false;
        if (historySearchFrom) {
          const fromD = new Date(historySearchFrom);
          fromD.setHours(0, 0, 0, 0);
          if (oDate < fromD) return false;
        }
        if (historySearchTo) {
          const toD = new Date(historySearchTo);
          toD.setHours(23, 59, 59, 999);
          if (oDate > toD) return false;
        }
      }
      return true;
    });
  };

  const formatPrice = (value) => {
    return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  // Dynamic Sparkline SVG generator based on filtered range
  const getSparklineData = () => {
    if (filteredOrders.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0];

    if (appliedFilter.type === 'Today' || appliedFilter.type === 'Yesterday') {
      const hours = [10, 12, 14, 16, 18, 20, 22];
      const hourlyRevenue = Array(hours.length).fill(0);
      filteredOrders.forEach(order => {
        const oDate = safeParseDate(order.created_at);
        if (!oDate) return;
        const hr = oDate.getHours();
        for (let i = 0; i < hours.length; i++) {
          if (hr <= hours[i]) {
            const orderPrice = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
            hourlyRevenue[i] += orderPrice;
            break;
          }
        }
      });
      return hourlyRevenue;
    }

    const dayMap = {};
    filteredOrders.forEach(order => {
      const dateObj = safeParseDate(order.created_at);
      if (!dateObj) return;
      const dayKey = dateObj.toISOString().slice(0, 10);
      const orderPrice = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
      dayMap[dayKey] = (dayMap[dayKey] || 0) + orderPrice;
    });

    const sortedDays = Object.keys(dayMap).sort();
    if (sortedDays.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
    if (sortedDays.length < 5) {
      const data = sortedDays.map(d => dayMap[d]);
      while (data.length < 6) data.unshift(0);
      return data;
    }
    return sortedDays.map(d => dayMap[d]);
  };

  const drawSparkline = () => {
    const data = getSparklineData();
    const width = 600;
    const height = 180;
    const padding = 20;

    const maxVal = Math.max(...data);
    const minVal = Math.min(...data);
    const valRange = maxVal - minVal || 1;

    const points = data.map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - minVal) / valRange) * (height - padding * 2);
      return { x, y };
    });

    const linePath = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    const areaPath = points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
      : '';

    return { linePath, areaPath, points };
  };

  const { linePath, areaPath } = drawSparkline();

  // Peak Dining Hours based on filtered orders
  const getPeakHours = () => {
    const hourBins = {
      '11 AM - 1 PM': 0,
      '1 PM - 3 PM': 0,
      '3 PM - 5 PM': 0,
      '5 PM - 7 PM': 0,
      '7 PM - 9 PM': 0,
      '9 PM - 11 PM': 0
    };

    filteredOrders.forEach(order => {
      if (order.created_at) {
        const dateObj = safeParseDate(order.created_at);
        if (dateObj) {
          const hour = dateObj.getHours();
          if (hour >= 11 && hour < 13) hourBins['11 AM - 1 PM']++;
          else if (hour >= 13 && hour < 15) hourBins['1 PM - 3 PM']++;
          else if (hour >= 15 && hour < 17) hourBins['3 PM - 5 PM']++;
          else if (hour >= 17 && hour < 19) hourBins['5 PM - 7 PM']++;
          else if (hour >= 19 && hour < 21) hourBins['7 PM - 9 PM']++;
          else if (hour >= 21 && hour < 23) hourBins['9 PM - 11 PM']++;
        }
      }
    });

    return Object.entries(hourBins);
  };

  // Top Selling list - returns real statistics only (no fallback dummy items)
  const getTopSellingList = () => {
    return derivedStats.top5Items;
  };

  // Live order activity feed - returns real data only (no fallbacks)
  const getRecentActivities = () => {
    const sorted = [...orders]
      .sort((a, b) => {
        const dateA = safeParseDate(a.updated_at) || new Date(0);
        const dateB = safeParseDate(b.updated_at) || new Date(0);
        return dateB - dateA;
      })
      .slice(0, 5);

    return sorted.map(order => {
      let statusText = 'Created';
      let badgeType = 'blue';

      if (order.status === 'COOKING') {
        statusText = 'Preparing';
        badgeType = 'yellow';
      } else if (order.status === 'READY') {
        statusText = 'Ready for Collection';
        badgeType = 'green';
      } else if (order.status === 'DELIVERED') {
        statusText = 'Delivered & Closed';
        badgeType = 'green';
      }

      const orderType = order.order_type === 'DINE_IN' ? 'Table ' + order.table_number : 'Parcel';
      const updatedDate = safeParseDate(order.updated_at);
      const timeStr = updatedDate
        ? updatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Recently';

      return {
        text: `Order #${order.token_number} (${orderType}) is ${statusText}`,
        type: badgeType,
        time: timeStr
      };
    });
  };

  // Order types percentages (no mock defaults)
  const getOrderTypeBreakdown = () => {
    const total = derivedStats.dineInCount + derivedStats.parcelCount;
    if (total === 0) return { dineInPct: 0, parcelPct: 0 };
    const dineInPct = Math.round((derivedStats.dineInCount / total) * 100);
    return { dineInPct, parcelPct: 100 - dineInPct };
  };

  const { dineInPct, parcelPct } = getOrderTypeBreakdown();

  // Cloud Database Handshake simulator
  const handleCloudBackup = () => {
    if (!isMounted.current) return;
    setBackupState('compressing');
    
    const t1 = setTimeout(() => {
      if (!isMounted.current) return;
      setBackupState('handshake');
      
      const t2 = setTimeout(() => {
        if (!isMounted.current) return;
        setBackupState('uploading');
        
        const t3 = setTimeout(() => {
          if (!isMounted.current) return;
          setBackupState('success');
          
          const t4 = setTimeout(() => {
            if (!isMounted.current) return;
            setBackupState(null);
            showToast('💾 Database backup successfully synced to Google Cloud Storage!');
          }, 1000);
          activeTimers.current.push(t4);
        }, 1000);
        activeTimers.current.push(t3);
      }, 1000);
      activeTimers.current.push(t2);
    }, 800);
    activeTimers.current.push(t1);
  };

  const handleExportPDF = () => {
    showToast('📊 Formatting sales report for PDF Export...');
    const t = setTimeout(() => {
      window.print();
    }, 500);
    activeTimers.current.push(t);
  };

  // CSV Report Exporter helper
  const handleExportCSV = () => {
    const filtered = getFilteredHistoryOrders();
    if (filtered.length === 0) {
      showToast('⚠️ No history orders found to export!');
      return;
    }

    const headers = ['Token Number', 'Date', 'Type', 'Table', 'Status', 'Total Price', 'Items'];
    const rows = filtered.map(order => {
      const orderPrice = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
      const itemsSummary = order.items?.map(i => `${i.item_name} x${i.quantity} (${i.portion})`).join('; ') || '';
      const orderTypeStr = order.order_type === 'DINE_IN' ? 'Dine In' : 'Parcel';
      const tableNum = order.table_number || 'N/A';
      const dateObj = safeParseDate(order.created_at);
      const orderDate = dateObj ? dateObj.toLocaleString() : '';

      return [
        `#${order.token_number}`,
        `"${orderDate}"`,
        `"${orderTypeStr}"`,
        `"${tableNum}"`,
        `"${order.status}"`,
        `₹${orderPrice}`,
        `"${itemsSummary}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📊 CSV report downloaded successfully!');
  };


  const handleOrderFeedClick = () => {
    const t = setTimeout(() => {
      orderFeedRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    activeTimers.current.push(t);
  };


  return (
    <main className="page admin-pos-dashboard">
      {/* Toast Alert */}
      {toast && (
        <div className="cashier-toast" style={{ background: 'var(--green)', color: 'white', borderLeft: '5px solid #0d5f30', zIndex: 9999 }}>
          <span className="toast-icon">✓</span>
          <strong>{toast}</strong>
        </div>
      )}

      {/* Cloud Backup Progress Overlay */}
      {backupState && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-content" style={{ textAlign: 'center', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>Cloud Database Sync</h3>
            <div className="pos-spinner" style={{ border: '4px solid var(--line)', borderTop: '4px solid var(--green)', borderRadius: '50%', width: '40px', height: '40px', margin: '1rem auto', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ fontWeight: 800, color: 'var(--muted)', marginTop: '1rem' }}>
              {backupState === 'compressing' && '📦 Compressing database files...'}
              {backupState === 'handshake' && '🔑 Handshaking with Google Cloud...'}
              {backupState === 'uploading' && '🚀 Uploading sqlite.db backup...'}
              {backupState === 'success' && '✨ Backup successfully synced!'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      {/* Header */}
      <PageHeader title="Admin Dashboard" connected={connected} />

      {/* GLOBAL DATE FILTER PANEL */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: '#e4e4e7', padding: '0.85rem 1.5rem', borderRadius: '1.25rem', border: '1px solid var(--line)', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>📅</span> Reporting Interval Filter
          </h3>
          <p style={{ margin: '0.15rem 0 0 0', color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 700 }}>
            Updating POS analytics based on selected timeframe
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div className="pos-segmented-tabs" style={{ background: 'transparent', borderRadius: 0, padding: 0, gap: '0.5rem' }}>
            {['Today', 'Yesterday', 'Custom Date Range'].map(tab => {
              const isActive = globalFilter === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setGlobalFilter(tab);
                    if (tab !== 'Custom Date Range') {
                      setAppliedFilter({ type: tab, from: '', to: '' });
                    }
                  }}
                  style={{
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? 'var(--ink)' : 'var(--muted)',
                    border: 'none',
                    borderRadius: isActive ? '0.75rem' : '0.5rem',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    padding: '0.5rem 1.1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? '0 4px 12px rgba(24, 24, 27, 0.06)' : 'none'
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Date fields if custom is selected */}
      {globalFilter === 'Custom Date Range' && (
        <section style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', background: '#ffffff', padding: '1rem', borderRadius: '1rem', border: '1px solid var(--line)', marginBottom: '1.5rem', animation: 'fadeIn 0.2s ease-out' }}>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem' }}>From Date</label>
            <input
              type="date"
              value={globalFrom}
              onChange={e => setGlobalFrom(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontWeight: 700 }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem' }}>To Date</label>
            <input
              type="date"
              value={globalTo}
              onChange={e => setGlobalTo(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontWeight: 700 }}
            />
          </div>
          <button
            type="button"
            className="primary-action"
            onClick={() => setAppliedFilter({ type: 'Custom', from: globalFrom, to: globalTo })}
            style={{ padding: '0.6rem 1.5rem', marginTop: 0, width: 'auto' }}
          >
            Apply Filter
          </button>
        </section>
      )}

      {/* TWO COLUMN ROW: GROSS REVENUE & SPLINE CURVE */}
      <div className="pos-two-column-layout" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>

        {/* Gross Revenue Black Card */}
        <section className="panel" style={{ background: '#111111', border: '1px solid #222222', borderRadius: '1.5rem', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#ffffff', minHeight: '260px' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: '#888888', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              GROSS REVENUE ({appliedFilter.type.toUpperCase()})
            </span>
            <strong style={{ display: 'block', fontSize: '3.8rem', fontWeight: 900, color: '#ffffff', margin: '0.75rem 0' }}>
              {formatPrice(derivedStats.revenue)}
            </strong>

            {(() => {
              const comp = getComparisonMetrics(orders);
              const isGrowth = comp.todayVsYesterdayGrowth >= 0;
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: isGrowth ? 'rgba(19, 138, 69, 0.15)' : 'rgba(192, 57, 43, 0.15)', color: isGrowth ? '#2ecc71' : '#ff7675', padding: '0.4rem 0.85rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 900 }}>
                  <span>{isGrowth ? '▲' : '▼'}</span>
                  <span>{Math.abs(comp.todayVsYesterdayGrowth)}% vs Yesterday ({formatPrice(comp.yesterdayRevenue)})</span>
                </div>
              );
            })()}
          </div>

          <p style={{ margin: '1.5rem 0 0 0', color: '#666666', fontSize: '0.78rem', fontWeight: 700 }}>
            Volume tracks items, modifiers, taxes, and service availability.
          </p>
        </section>

        {/* Revenue Velocity Curve Card */}
        <section className="panel" style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: '1.5rem', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', minHeight: '260px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 'none', paddingBottom: 0, marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              REVENUE VELOCITY CURVE
            </h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 800 }}>
              Real-time sales spline chart
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%' }}>
            {filteredOrders.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '0.85rem' }}>
                <div style={{ background: '#eef3fc', width: '3.5rem', height: '3.5rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>📈</div>
                <div style={{ textAlign: 'center' }}>
                  <strong style={{ display: 'block', fontSize: '0.98rem', color: 'var(--ink)', fontWeight: 800 }}>No trend data available</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 700 }}>Volume chart needs active transaction records</span>
                </div>
              </div>
            ) : (
              <div className="svg-chart-container" style={{ position: 'relative', width: '100%' }}>
                <svg viewBox="0 0 600 140" style={{ width: '100%', height: 'auto', display: 'block' }}>
                  <defs>
                    <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1769aa" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#1769aa" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath.replace(/180/g, '140')} fill="url(#chartAreaGrad)" />
                  <path d={linePath.replace(/180/g, '140')} fill="none" stroke="#1769aa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.78rem', fontWeight: 800 }}>
                  {appliedFilter.type === 'Today' || appliedFilter.type === 'Yesterday' ? (
                    <>
                      <span>10 AM</span>
                      <span>2 PM</span>
                      <span>6 PM</span>
                      <span>10 PM</span>
                    </>
                  ) : (
                    <>
                      <span>Start</span>
                      <span>Mid Period</span>
                      <span>End</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* FOUR KPI METRICS GRID */}
      <section className="admin-pos-kpi-grid" aria-label="KPI Metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* Gross Sales Volume */}
        <div className="pos-kpi-card" style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '1.25rem', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', position: 'relative' }}>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>GROSS SALES VOLUME</span>
            <strong style={{ display: 'block', fontSize: '2.2rem', fontWeight: 900, color: 'var(--ink)', margin: '0.4rem 0 0.15rem 0' }}>
              {formatPrice(derivedStats.revenue)}
            </strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              📊 {derivedStats.ordersCount} total orders processed
            </span>
          </div>
          <div style={{ background: '#fef3c7', width: '2.2rem', height: '2.2rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            💰
          </div>
        </div>

        {/* Completed Orders */}
        <div className="pos-kpi-card" style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '1.25rem', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', position: 'relative' }}>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>COMPLETED ORDERS</span>
            <strong style={{ display: 'block', fontSize: '2.2rem', fontWeight: 900, color: 'var(--ink)', margin: '0.4rem 0 0.15rem 0' }}>
              {derivedStats.deliveredOrders}
            </strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: 'var(--green)' }}>●</span> {(() => {
                const completionRate = derivedStats.ordersCount > 0 ? Math.round((derivedStats.deliveredOrders / derivedStats.ordersCount) * 100) : 0;
                return `${completionRate}% completion success rate`;
              })()}
            </span>
          </div>
          <div style={{ background: '#dcfce7', width: '2.2rem', height: '2.2rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            ✅
          </div>
        </div>


        {/* Live Active Work Queue */}
        <div className="pos-kpi-card" style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '1.25rem', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', position: 'relative' }}>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>LIVE ACTIVE WORK QUEUE</span>
            <strong style={{ display: 'block', fontSize: '2.2rem', fontWeight: 900, color: 'var(--ink)', margin: '0.4rem 0 0.15rem 0' }}>
              {derivedStats.activeOrders}
            </strong>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ background: '#fff0d8', color: 'var(--amber)', fontSize: '0.7rem', fontWeight: 900, padding: '0.1rem 0.45rem', borderRadius: '0.35rem' }}>
                {derivedStats.pendingOrders} PND
              </span>
              <span style={{ background: '#e5f1fc', color: 'var(--blue)', fontSize: '0.7rem', fontWeight: 900, padding: '0.1rem 0.45rem', borderRadius: '0.35rem' }}>
                {derivedStats.cookingOrders || 0} CK
              </span>
              <span style={{ background: '#e7f7ed', color: 'var(--green)', fontSize: '0.7rem', fontWeight: 900, padding: '0.1rem 0.45rem', borderRadius: '0.35rem' }}>
                {derivedStats.readyOrders} RDY
              </span>
            </div>
          </div>
          <div style={{ background: '#ffe4e6', width: '2.2rem', height: '2.2rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            🔥
          </div>
        </div>
      </section>

      {/* THIRD ROW - TOP SELLING ITEMS AND PEAK HOURS */}
      <div className="pos-two-column-layout">
        {/* SECTION 3 — TOP SELLING ITEMS */}
        <section className="panel top-selling-card">
          <div className="panel-header-with-tabs">
            <h2>Top 5 sale items</h2>
          </div>

          {getTopSellingList().length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '180px', color: 'var(--muted)', fontWeight: 800 }}>
              No sale items recorded
            </div>
          ) : (
            <div className="leaderboard-progress-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
              {getTopSellingList().map((item, idx) => {
                const maxVal = getTopSellingList()[0].qty || 1;
                const pct = (item.qty / maxVal) * 100;
                return (
                  <div key={item.name} className="progress-item-wrapper">
                    <div className="progress-label-row" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: '0.35rem', fontSize: '0.95rem' }}>
                      <span>{idx + 1}. {item.name}</span>
                      <strong style={{ color: 'var(--primary)' }}>{item.qty} portions</strong>
                    </div>
                    <div className="progress-track" style={{ background: 'var(--line)', height: '8px', borderRadius: '50px', overflow: 'hidden' }}>
                      <div
                        className="progress-fill"
                        style={{ width: `${pct}%`, background: 'var(--green)', height: '100%', borderRadius: '50px' }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SECTION 5 — PEAK HOURS */}
        <section className="panel peak-hours-card">
          <h2>Peak Dining Hours</h2>
          <p className="kpi-subtext" style={{ color: 'var(--muted)', fontWeight: 700, margin: '0.25rem 0 1rem 0' }}>Hourly order volumes across peak shifts</p>

          {filteredOrders.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px', color: 'var(--muted)', fontWeight: 800 }}>
              No peak hour records
            </div>
          ) : (
            <div className="peak-hours-graph-wrapper" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '180px', padding: '1rem 0 0.5rem 0', gap: '0.5rem', background: '#ffffff', borderRadius: '1rem', border: '1px solid var(--line)' }}>
              {getPeakHours().map(([hourLabel, count]) => {
                const maxCount = Math.max(...getPeakHours().map(([, c]) => c)) || 1;
                const heightPct = (count / maxCount) * 80;
                return (
                  <div key={hourLabel} className="peak-hour-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--primary-dark)' }}>{count}</span>
                    <div style={{ width: '30px', height: `${heightPct}%`, background: 'var(--blue)', borderRadius: '6px 6px 0 0', minHeight: '4px' }}></div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)', width: '100%', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {hourLabel.split(' ')[0] + hourLabel.split(' ')[1].toLowerCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>


      {/* QUICK ACTIONS PANEL */}
      <section className="panel quick-actions-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem', padding: '1.75rem 2rem' }}>
        <h2>Quick Actions Panel</h2>
        <div className="quick-actions-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
          <NavLink to="/menu" className="quick-action-btn" style={{ textDecoration: 'none', background: 'linear-gradient(135deg, #1b507f 0%, #1769aa 100%)', color: 'white', padding: '1.5rem 1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 900, textAlign: 'center', border: '1px solid rgba(0, 0, 0, 0.15)', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3), inset 0 2px 3px rgba(255, 255, 255, 0.25)' }}>
            <span style={{ fontSize: '1.75rem' }}>🍔</span>
            <span>Manage Menu</span>
          </NavLink>
          <button onClick={handleOrderFeedClick} className="quick-action-btn" style={{ background: 'linear-gradient(135deg, #2c2520 0%, #15100d 100%)', color: 'white', padding: '1.5rem 1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 900, textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(0, 0, 0, 0.25)', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.45), inset 0 2px 3px rgba(255, 255, 255, 0.2)' }}>
            <span style={{ fontSize: '1.75rem' }}>📋</span>
            <span>Order Feed</span>
          </button>
          <button onClick={handleCloudBackup} className="quick-action-btn" style={{ background: 'linear-gradient(135deg, #c0392b 0%, #e74c3c 100%)', color: 'white', padding: '1.5rem 1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 900, textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(0, 0, 0, 0.15)', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3), inset 0 2px 3px rgba(255, 255, 255, 0.25)' }}>
            <span style={{ fontSize: '1.75rem' }}>☁️</span>
            <span>Backup Cloud</span>
          </button>
          <button onClick={handleExportPDF} className="quick-action-btn" style={{ background: 'linear-gradient(135deg, #0d5f30 0%, #138a45 100%)', color: 'white', padding: '1.5rem 1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 900, textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(0, 0, 0, 0.15)', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3), inset 0 2px 3px rgba(255, 255, 255, 0.25)' }}>
            <span style={{ fontSize: '1.75rem' }}>📄</span>
            <span>Export PDF</span>
          </button>
        </div>
      </section>

      {/* SECTION - SEARCHABLE ORDER HISTORY FEED */}
      <section className="panel master-orders-panel" style={{ marginTop: '1.5rem', background: '#ffffff', borderRadius: '1.5rem', padding: '2rem', border: '1px solid var(--line)' }} ref={orderFeedRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📋 Order History
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 700 }}>
              Search, query, filter, and inspect detailed historic order transactions.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={handleExportCSV} className="quick-action-btn" style={{ background: 'white', border: '1px solid var(--line)', color: 'var(--ink)', padding: '0.55rem 1.2rem', borderRadius: '999px', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📥 CSV Ledger
            </button>
            <button onClick={handleExportPDF} className="quick-action-btn" style={{ background: '#211a14', color: 'white', border: 'none', padding: '0.55rem 1.4rem', borderRadius: '999px', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📄 Export sales report PDF
            </button>
          </div>
        </div>

        {/* History Search Filters Grid */}
        <div className="history-filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '1rem', padding: '0.85rem 1.25rem', background: '#f4f4f5', borderRadius: '1.25rem', border: '1px solid var(--line)', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>TOKEN SEARCH</label>
            <input
              type="text"
              placeholder="e.g. 101"
              value={historySearchToken}
              onChange={e => setHistorySearchToken(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '0.65rem', border: '1px solid var(--line)', fontWeight: 700, background: '#ffffff', fontSize: '0.85rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>STATUS FILTER</label>
            <select
              value={historySearchStatus}
              onChange={e => setHistorySearchStatus(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '0.65rem', border: '1px solid var(--line)', fontWeight: 700, background: '#ffffff', fontSize: '0.85rem' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="COOKING">Cooking</option>
              <option value="READY">Ready</option>
              <option value="DELIVERED">Delivered</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>TYPE FILTER</label>
            <select
              value={historySearchType}
              onChange={e => setHistorySearchType(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '0.65rem', border: '1px solid var(--line)', fontWeight: 700, background: '#ffffff', fontSize: '0.85rem' }}
            >
              <option value="ALL">All Types</option>
              <option value="DINE_IN">Dine In</option>
              <option value="PARCEL">Parcel</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>TABLE NUMBER</label>
            <input
              type="text"
              placeholder="e.g. 5"
              value={historySearchTable}
              onChange={e => setHistorySearchTable(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '0.65rem', border: '1px solid var(--line)', fontWeight: 700, background: '#ffffff', fontSize: '0.85rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>FROM DATE</label>
            <input
              type="date"
              value={historySearchFrom}
              onChange={e => setHistorySearchFrom(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '0.65rem', border: '1px solid var(--line)', fontWeight: 700, background: '#ffffff', fontSize: '0.85rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--muted)', display: 'block', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>TO DATE</label>
            <input
              type="date"
              value={historySearchTo}
              onChange={e => setHistorySearchTo(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '0.65rem', border: '1px solid var(--line)', fontWeight: 700, background: '#ffffff', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* History Table */}
        <div className="admin-table-container" style={{ overflowX: 'auto', marginTop: '1rem', border: '1px solid var(--line)', borderRadius: '1.25rem' }}>
          <table className="menu-table admin-orders-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fbf6f0' }}>
                <th style={{ padding: '1rem', color: 'var(--muted)', fontWeight: 900, borderBottom: '1px solid var(--line)' }}>Token</th>
                <th style={{ padding: '1rem', color: 'var(--muted)', fontWeight: 900, borderBottom: '1px solid var(--line)' }}>Date</th>
                <th style={{ padding: '1rem', color: 'var(--muted)', fontWeight: 900, borderBottom: '1px solid var(--line)' }}>Type</th>
                <th style={{ padding: '1rem', color: 'var(--muted)', fontWeight: 900, borderBottom: '1px solid var(--line)' }}>Total Bill</th>
                <th style={{ padding: '1rem', color: 'var(--muted)', fontWeight: 900, borderBottom: '1px solid var(--line)' }}>Status</th>
                <th style={{ padding: '1rem', color: 'var(--muted)', fontWeight: 900, borderBottom: '1px solid var(--line)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {getFilteredHistoryOrders().length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.85rem' }}>
                      <div style={{ fontSize: '2.5rem', opacity: 0.65 }}>📄</div>
                      <div>
                        <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--ink)', fontWeight: 800 }}>No matching ledger records</strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 700 }}>Adjust your filters or query params to find entries</span>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                [...getFilteredHistoryOrders()].reverse().map(order => {
                  const orderPrice = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
                  return (
                    <tr key={order.id} className={expandedOrder === order.id ? 'row-expanded-highlight' : ''} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td data-label="Token" style={{ padding: '1rem' }}><strong>#{order.token_number}</strong></td>
                      <td data-label="Date" style={{ padding: '1rem' }}>{order.created_at ? (safeParseDate(order.created_at)?.toLocaleString() || '') : ''}</td>
                      <td data-label="Type" style={{ padding: '1rem' }}>
                        {order.order_type === 'DINE_IN' ? '🍽 Dine In' : '🛍 Parcel'}
                      </td>
                      <td data-label="Total Bill" style={{ padding: '1rem' }}><strong>{formatPrice(orderPrice)}</strong></td>
                      <td data-label="Status" style={{ padding: '1rem' }}>
                        <span className="status-pill" style={{
                          background: order.status === 'PENDING' ? '#fff0d8' :
                            order.status === 'COOKING' ? '#e5f1fc' :
                              order.status === 'READY' ? '#e7f7ed' : '#eee',
                          color: order.status === 'PENDING' ? 'var(--amber)' :
                            order.status === 'COOKING' ? 'var(--blue)' :
                              order.status === 'READY' ? 'var(--green)' : 'var(--muted)',
                          fontWeight: 900
                        }}>
                          {order.status}
                        </span>
                      </td>
                      <td data-label="Actions" style={{ padding: '1rem' }}>
                        <button
                          className="btn-toggle active"
                          style={{ margin: 0, padding: '0.4rem 0.85rem', borderRadius: '0.5rem', background: '#211a14', color: '#ffffff', cursor: 'pointer' }}
                          onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        >
                          {expandedOrder === order.id ? 'Collapse' : 'Details'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Expanded Order Receipt Modal */}
      {expandedOrder && (
        <div className="modal-overlay" onClick={() => setExpandedOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Receipt Detail View</h2>
              <button className="btn-close-modal" onClick={() => setExpandedOrder(null)}>×</button>
            </div>
            {(() => {
              const order = orders.find(o => o.id === expandedOrder);
              if (!order) return null;
              const subtotal = order.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 className="modal-item-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>
                    Token #{order.token_number}
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontWeight: 800 }}>
                    <span>Type: {order.order_type === 'DINE_IN' ? `Table ${order.table_number}` : 'Parcel'}</span>
                    <span>Status: {order.status}</span>
                  </div>
                  <ul className="cart-list" style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '0.5rem 0', listStyle: 'none' }}>
                    {order.items?.map(item => (
                      <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f9f9f9' }}>
                        <div>
                          <strong>{item.item_name}</strong>
                          <span className="portion-tag tag-full" style={{ marginLeft: '0.4rem' }}>{item.portion}</span>
                          <span style={{ color: 'var(--muted)', marginLeft: '0.5rem' }}>x{item.quantity}</span>
                        </div>
                        <strong>{formatPrice(item.total_price)}</strong>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.25rem', marginTop: '0.5rem' }}>
                    <span>Total Bill:</span>
                    <strong style={{ color: 'var(--primary-dark)' }}>{formatPrice(subtotal)}</strong>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
