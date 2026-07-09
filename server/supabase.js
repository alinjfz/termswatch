import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabaseAdmin() {
  if (_client) return _client;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL or VITE_SUPABASE_URL must be set');
  }

  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  _client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  return _client;
}
