import { createClient, SupabaseClient } from '@supabase/supabase-js'

let stagingClient: SupabaseClient | null = null
let stagingServiceClient: SupabaseClient | null = null
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

export function getStagingServiceClient(): SupabaseClient {
  if (stagingServiceClient) {
    return stagingServiceClient
  }

  const supabaseUrl = process.env.SUPABASE_URL_STAGING
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY_STAGING

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing staging Supabase service environment variables (SUPABASE_URL_STAGING, SUPABASE_SERVICE_KEY_STAGING)')
  }

  stagingServiceClient = createClient(supabaseUrl, supabaseServiceKey)
  return stagingServiceClient
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
