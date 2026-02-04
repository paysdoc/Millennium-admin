import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null
let supabaseServiceClient: SupabaseClient | null = null

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
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseKey && 'SUPABASE_KEY',
    ].filter(Boolean)
    console.error(`Missing Supabase environment variables: ${missing.join(', ')}`)
    throw new Error('Missing Supabase environment variables')
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey)
  return supabaseClient
}

/**
 * Get a Supabase client with service role privileges.
 * Use this for write operations that need to bypass Row Level Security.
 * Only use server-side in trusted contexts (e.g., API routes).
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (supabaseServiceClient) {
    return supabaseServiceClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseServiceKey && 'SUPABASE_SERVICE_KEY',
    ].filter(Boolean)
    console.error(`Missing Supabase service environment variables: ${missing.join(', ')}`)
    throw new Error('Missing Supabase service environment variables')
  }

  supabaseServiceClient = createClient(supabaseUrl, supabaseServiceKey)
  return supabaseServiceClient
}
