import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function SupabaseConnectionTest() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'connected' | 'failed'
  const [errorMsg, setErrorMsg] = useState('');
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    async function testConnection() {
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*');

        if (error) {
          console.error('Supabase connection error:', error);
          setStatus('failed');
          setErrorMsg(error.message);
        } else {
          console.log('Supabase menu_items fetch success:', data);
          setStatus('connected');
          setItemCount(data?.length || 0);
        }
      } catch (err) {
        console.error('Unexpected error testing Supabase connection:', err);
        setStatus('failed');
        setErrorMsg(err.message || 'Unknown error');
      }
    }

    testConnection();
  }, []);

  return (
    <div style={{
      padding: '1.5rem',
      borderRadius: '12px',
      border: '1px solid var(--line, #e2e8f0)',
      background: 'var(--card-bg, #ffffff)',
      boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))',
      maxWidth: '400px',
      margin: '1.5rem auto',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--ink, #1e293b)' }}>Database Status</h3>
      
      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--amber, #d97706)', fontWeight: 'bold' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
          Loading...
        </div>
      )}

      {status === 'connected' && (
        <div>
          <div style={{ color: '#059669', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>✓</span> Supabase Connected Successfully
          </div>
          <div style={{ fontSize: '0.95rem', color: 'var(--ink-light, #475569)' }}>
            <strong>Menu Items Count:</strong> {itemCount}
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div>
          <div style={{ color: '#dc2626', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>❌</span> Connection Failed
          </div>
          <div style={{ 
            fontSize: '0.85rem', 
            color: '#991b1b', 
            background: '#fef2f2', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #fee2e2',
            wordBreak: 'break-word',
            fontFamily: 'monospace'
          }}>
            {errorMsg}
          </div>
        </div>
      )}
    </div>
  );
}
