import type { Knex } from 'knex'

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
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
