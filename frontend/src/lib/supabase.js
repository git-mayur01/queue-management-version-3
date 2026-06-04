import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase configuration parameters VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing in the frontend environment.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
