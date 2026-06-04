import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://qferbxbmgqqtftjawsly.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_jCcOE7fh4nMFHVihrEEPvQ_F39XmLG-';

const edgeFunctionUrl = `${supabaseUrl}/functions/v1/manage-users`;

async function runTests() {
  console.log('Starting Edge Function Integration Tests...');

  // 1. Verify Unauthenticated Request is rejected (401)
  try {
    const res = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashier: { username: 'test_cashier' } })
    });
    if (res.status === 401) {
      console.log('✅ PASS: Unauthenticated request rejected with 401');
    } else {
      console.error(`❌ FAIL: Expected 401, got ${res.status}`);
    }
  } catch (err) {
    console.error('Error in test 1:', err);
  }

  // 2. Verify Non-Admin Request is rejected (403)
  try {
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: cashierAuth, error: loginErr } = await client.auth.signInWithPassword({
      email: 'cashier@restaurant.com',
      password: 'cashierPassword' // Assumes current cashier password
    });

    if (loginErr) {
      console.warn('⚠️ WARNING: Cashier login failed, skipping 403 test. Details:', loginErr.message);
    } else {
      const res = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cashierAuth.session.access_token}`
        },
        body: JSON.stringify({ cashier: { username: 'new_cashier_name' } })
      });
      if (res.status === 403) {
        console.log('✅ PASS: Cashier request rejected with 403');
      } else {
        console.error(`❌ FAIL: Expected 403, got ${res.status}`);
      }
    }
  } catch (err) {
    console.error('Error in test 2:', err);
  }

  // 3. Verify Admin Request succeeds (200) and updates correctly
  try {
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: adminAuth, error: adminLoginErr } = await client.auth.signInWithPassword({
      email: 'admin@restaurant.com',
      password: 'NewAdminPassword123!' // set during setup
    });

    if (adminLoginErr) {
      console.warn('⚠️ WARNING: Admin login failed, skipping 200 test. Details:', adminLoginErr.message);
    } else {
      const payload = {
        cashier: { username: 'cashier_user', password: 'newCashierPassword123' },
        kitchen: { username: 'kitchen_user' },
        display: { username: 'display_user' }
      };

      const res = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminAuth.session.access_token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 200) {
        const data = await res.json();
        if (data.success) {
          console.log('✅ PASS: Admin request succeeded with 200');
        } else {
          console.error('❌ FAIL: Request returned 200 but success flag is false', data);
        }
      } else {
        console.error(`❌ FAIL: Expected 200, got ${res.status}`, await res.text());
      }
    }
  } catch (err) {
    console.error('Error in test 3:', err);
  }
}

runTests().catch(console.error);
