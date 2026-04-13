// lib/supabase.js
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('⚠  Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Railway Variables');
}

const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;

module.exports = supabase;

