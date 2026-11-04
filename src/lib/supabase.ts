import { createClient } from '@supabase/supabase-js'

// Both values come from .env (see .env.example). Only the public "anon" key
// belongs in the frontend; real protection is the database's RLS and functions.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when .env is missing or incomplete; the app shows a setup message. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// createClient throws on an empty URL, so use inert placeholders when the
// variables are missing. App.tsx never lets the app run in that case.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'missing-anon-key',
)
