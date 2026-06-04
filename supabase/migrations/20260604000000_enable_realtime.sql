-- Migration: Enable Supabase Realtime for orders, order_items, and menu_items tables
-- Description: Adds the orders, order_items, and menu_items tables to the supabase_realtime publication to enable WebSocket broadcasts.

BEGIN;

-- Add orders table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Add order_items table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

-- Add menu_items table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;

COMMIT;
