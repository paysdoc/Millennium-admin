import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Constructs a full Supabase Storage URL from a storage path.
 * The path should include the bucket name (e.g., 'character_images/filename.jpg').
 * Returns null if path is null/empty, or the path unchanged if already a full URL.
 */
export function getSupabaseStorageUrl(path: string | null): string | null {
  if (!path) {
    return null
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    return null
  }

  return `${supabaseUrl}/storage/v1/object/public/${path}`
}

export function getSupabaseClient(): SupabaseClient {
  if (client) {
    return client
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)')
  }

  client = createClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
  return client
}
