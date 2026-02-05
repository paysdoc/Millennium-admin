import { createClient, SupabaseClient } from '@supabase/supabase-js'

let stagingClient: SupabaseClient | null = null
let productionClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  return getStagingSupabaseClient()
}

export function getStagingSupabaseClient(): SupabaseClient {
  if (stagingClient) {
    return stagingClient
  }

  const supabaseUrl = process.env.SUPABASE_URL_STAGING
  const supabaseKey = process.env.SUPABASE_KEY_STAGING

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing staging Supabase environment variables (SUPABASE_URL_STAGING, SUPABASE_KEY_STAGING)')
  }

  stagingClient = createClient(supabaseUrl, supabaseKey)
  return stagingClient
}

export function getProductionSupabaseClient(): SupabaseClient {
  if (productionClient) {
    return productionClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing production Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)')
  }

  productionClient = createClient(supabaseUrl, supabaseKey)
  return productionClient
}
