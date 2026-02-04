import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export function getSupabaseStorageUrl(path: string | null): string | null {
  if (!path || path.trim() === '') {
    return null
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const bucketName = process.env.SUPABASE_BUCKET_NAME

  if (!supabaseUrl || !bucketName) {
    return null
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${path}`
}

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey)
  return supabaseClient
}
