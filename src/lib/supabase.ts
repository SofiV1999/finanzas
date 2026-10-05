import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

// Si faltan las variables de entorno, la app muestra la pantalla de configuración
// en vez de fallar, así que aquí se usan valores de relleno.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder',
)
