import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseEnv } from './config'

export const createClient = () => {
  const env = getSupabaseEnv()
  if (!env) return null

  return createBrowserClient(env.url, env.publishableKey)
}
