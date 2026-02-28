// ==================== SUPABASE INIT (CDN) ====================
// NOTE: This project intentionally uses a simple email+password check (per requirements).
// Do NOT hardcode any admin checks in the frontend. Always read `role` from DB.

(function () {
  const SUPABASE_URL = 'https://lwrhnnfcmqvdodlsmwif.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3cmhubmZjbXF2ZG9kbHNtd2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMzk1MjIsImV4cCI6MjA4NzgxNTUyMn0.Xq8cxoytVBVzYz7WqQnrs6r2kkUOq8k804lK7UMFL1o';

  if (!window.supabase) {
    console.error('[Supabase] CDN not loaded. Ensure @supabase/supabase-js is included before supabase.js');
    return;
  }

  // Create and expose the client
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- Helpers ----------
  window.normalizeEmail = function (email) {
    return String(email || '').trim().toLowerCase();
  };

  window.sbGetUserByEmail = async function (email) {
    const e = window.normalizeEmail(email);
    const { data, error } = await window.sb
      .from('Users')
      .select('*')
      .eq('email', e)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  };

  window.sbFetchAllUsers = async function () {
    const { data, error } = await window.sb
      .from('Users')
      .select('*')
      .order('email', { ascending: true });

    if (error) throw error;
    return data || [];
  };

  window.sbUpdateUserById = async function (id, patch) {
    const { data, error } = await window.sb
      .from('Users')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data || null;
  };

  window.sbDeleteUserById = async function (id) {
    const { error } = await window.sb.from('Users').delete().eq('id', id);
    if (error) throw error;
    return true;
  };

  // Attempt to upsert the super admin once (will only work if your RLS/policies allow it).
  // You were instructed to insert this record manually in Supabase, so failure here is OK.
  window.sbEnsureSuperAdminRecord = async function () {
    try {
      const email = window.normalizeEmail('ekwuemevictor39@gmail.com');
      const existing = await window.sbGetUserByEmail(email);
      if (existing) return existing;

      const superAdminRecord = {
        name: 'Victor',
        email,
        password: 'Vicker@3969',
        role: 'super_admin',
        status: 'active',
        wallet: { balance: 0, pending: 0 },
        investment: { amount: 0, profit: 0, completed: false }
      };

      const { data, error } = await window.sb
        .from('Users')
        .insert(superAdminRecord)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data || null;
    } catch (e) {
      // Silent: manual insert is the supported path.
      return null;
    }
  };
  // Auto-ensure the Super Admin record exists on every page load (silent, no UI impact)
  // This runs once per session so the admin can log in from any device.
  window.sbEnsureSuperAdminRecord();

})();
