import type { Knex } from 'knex'

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function buildConnectionUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (supabaseUrl && supabaseServiceKey) {
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
    if (match) {
      const ref = match[1]
      const region = process.env.SUPABASE_DB_REGION || 'us-east-1'
      const encodedKey = encodeURIComponent(supabaseServiceKey)
      return `postgresql://postgres.${ref}:${encodedKey}@aws-0-${region}.pooler.supabase.com:6543/postgres`
    }
  }

  return LOCAL_DB_URL
}

const config: Knex.Config = {
  client: 'pg',
  connection: buildConnectionUrl(),
  migrations: {
    directory: './knex/migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './knex/seeds',
    extension: 'ts',
  },
}

export default config
