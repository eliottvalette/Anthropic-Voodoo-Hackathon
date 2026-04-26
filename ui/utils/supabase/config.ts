export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) return null

  return { url, publishableKey }
}

export function hasSupabaseEnv() {
  return getSupabaseEnv() !== null
}
