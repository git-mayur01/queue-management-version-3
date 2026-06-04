import { supabase } from '../lib/supabase.js';

function formatOrder(order) {
  if (!order) return null;
  const formattedItems = (order.order_items || []).map(item => ({
    ...item,
    id: Number(item.id),
    order_id: Number(item.order_id),
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    total_price: Number(item.total_price)
  })).sort((a, b) => a.id - b.id);

  return {
    ...order,
    id: Number(order.id),
    token_number: Number(order.token_number),
    items: formattedItems
  };
}

export const api = {
  login: async (role, username, password) => {
    const email = `${username.toLowerCase().trim()}@restaurant.com`;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;

    // Fetch profile to confirm role matching
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .eq('role', role.toLowerCase())
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      throw new Error('Username not found for selected role.');
    }

    const user = {
      id: profile.id,
      name: profile.name,
      username: username,
      role: profile.role
    };

    // Store session locally to maintain compatibility
    sessionStorage.setItem('user', JSON.stringify(user));
    sessionStorage.setItem('token', data.session.access_token);

    return {
      success: true,
      token: data.session.access_token,
      user
    };
  },

  getUsers: async () => {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('role, name')
      .in('role', ['cashier', 'kitchen', 'display']);

    if (error) throw error;

    const usersMap = {
      cashier: { username: 'cashier_user' },
      kitchen: { username: 'kitchen_user' },
      display: { username: 'display_user' }
    };

    for (const p of profiles) {
      usersMap[p.role] = { username: p.name };
    }
    return usersMap;
  },

  saveUsers: async (payload) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: payload
    });
    if (error) throw error;
    return data;
  },

  getMenu: async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .order('name');
    if (error) throw error;

    return {
      items: data.map(item => ({
        id: item.id,
        name: item.name,
        halfPrice: Number(item.half_price),
        fullPrice: Number(item.full_price),
        available: item.available,
        category: item.category
      }))
    };
  },

  saveMenu: async (items) => {
    if (!Array.isArray(items)) {
      throw new Error('Menu items must be an array');
    }
    const validated = items.map(item => ({
      name: item.name.trim(),
      half_price: Number(item.halfPrice) || 0,
      full_price: Number(item.fullPrice) || 0,
      available: !!item.available,
      category: item.category || 'OTHERS'
    }));

    // Fetch existing catalog
    const { data: existingItems, error: fetchError } = await supabase
      .from('menu_items')
      .select('name');
    if (fetchError) throw fetchError;

    // Bulk upsert
    const { error: upsertError } = await supabase
      .from('menu_items')
      .upsert(validated, { onConflict: 'name' });
    if (upsertError) throw upsertError;

    // Remove deleted items
    const activeNames = validated.map(item => item.name);
    const toDelete = existingItems
      .map(item => item.name)
      .filter(name => !activeNames.includes(name));

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('menu_items')
        .delete()
        .in('name', toDelete);
      if (deleteError) console.error('Error deleting menu items:', deleteError);
    }

    return {
      success: true,
      items
    };
  },

  createOrder: async (payload) => {
    const { data, error } = await supabase.rpc('create_order', {
      p_table_number: payload.table_number,
      p_order_type: payload.order_type,
      p_items: payload.items
    });
    if (error) throw error;
    const mapped = {
      ...data,
      order_items: data.items
    };
    return formatOrder(mapped);
  },

  addOrderItem: async (orderId, payload) => {
    // 1. Fetch order details to check if delivered
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('status, order_type')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error('Order not found');
    if (order.status === 'DELIVERED') throw new Error('Cannot edit a delivered order');

    // 2. Insert item
    const { error: insertError } = await supabase
      .from('order_items')
      .insert({
        order_id: orderId,
        item_name: payload.item_name,
        quantity: payload.quantity,
        portion: payload.portion || 'Full',
        unit_price: payload.unit_price || 0,
        total_price: payload.total_price || (payload.unit_price || 0) * payload.quantity,
        order_type: payload.order_type || order.order_type
      });
    if (insertError) throw insertError;

    // 3. Fetch and return updated order
    const { data: updated, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    return formatOrder(updated);
  },

  getOrders: async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('token_number', { ascending: true });
    if (error) throw error;
    return data.map(formatOrder);
  },

  getActiveOrders: async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .neq('status', 'DELIVERED')
      .order('token_number', { ascending: false });
    if (error) throw error;
    return data.map(formatOrder);
  },

  updateStatus: async (id, status) => {
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    const { data: updated, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    return formatOrder(updated);
  },

  getStats: async () => {
    const { data, error } = await supabase
      .from('daily_stats_view')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return {
      totalOrdersToday: Number(data?.total_orders_today || 0),
      pendingOrders: Number(data?.pending_orders || 0),
      cookingOrders: Number(data?.cooking_orders || 0),
      readyOrders: Number(data?.ready_orders || 0),
      deliveredOrders: Number(data?.delivered_orders || 0)
    };
  },

  getAggregation: async () => {
    const { data, error } = await supabase
      .from('cooking_aggregation_view')
      .select('*');
    if (error) throw error;
    return data.map(item => ({
      item_name: item.item_name,
      portion: item.portion,
      quantity: Number(item.quantity)
    }));
  },

  factoryReset: async (password) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthenticated');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password
    });

    if (authError) {
      throw new Error('Incorrect Admin password. Factory reset unauthorized.');
    }

    const { error } = await supabase.rpc('factory_reset_system');
    if (error) throw error;
    return { success: true };
  },

  updateItemStatus: async (orderId, itemId, status) => {
    const { error } = await supabase
      .from('order_items')
      .update({ status })
      .match({ id: itemId, order_id: orderId });
    if (error) throw error;

    const { data: updated, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    return formatOrder(updated);
  },

  bulkCompleteItem: async (itemName, portion) => {
    const { error } = await supabase.rpc('bulk_complete_item', {
      p_item_name: itemName,
      p_portion: portion
    });
    if (error) throw error;
    return { success: true };
  },

  removeOrderItem: async (orderId, itemId) => {
    const { data: item, error: fetchError } = await supabase
      .from('order_items')
      .select('status')
      .match({ id: itemId, order_id: orderId })
      .maybeSingle();

    if (fetchError || !item) {
      throw new Error('Item not found in this order');
    }

    if (item.status === 'COOKING' || item.status === 'READY' || item.status === 'SERVED') {
      throw new Error('This item is already being prepared and cannot be removed.');
    }

    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .match({ id: itemId, order_id: orderId });

    if (deleteError) throw deleteError;

    const { data: parentOrder, error: parentError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .maybeSingle();

    if (parentError) throw parentError;

    if (!parentOrder) {
      return { deleted: true };
    }

    const { data: updated, error: updatedError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (updatedError) throw updatedError;

    return { updatedOrder: formatOrder(updated) };
  }
};
