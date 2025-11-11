import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (typeof supabaseUrl === 'undefined' || typeof supabaseAnonKey === 'undefined') {
  console.error('[Supabase] Variables ausentes', {
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 5)}...` : supabaseAnonKey,
  });
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.');
}

console.info('[Supabase] URL detectada', supabaseUrl);
console.info('[Supabase] Key length', supabaseAnonKey.length);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});


