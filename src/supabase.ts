import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_KEY fehlen (siehe .env.example)');

export const supabase = createClient(url, key);
