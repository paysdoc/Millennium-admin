import type { Knex } from 'knex'

const CATEGORY_NAMES = [
  { key: 'R', name: 'Royalty' },
  { key: 'S', name: 'Statesmen' },
  { key: 'P', name: 'Philosophers' },
  { key: 'I', name: 'Inventors' },
  { key: 'M', name: 'Mathematical Scientists' },
  { key: 'N', name: 'Natural Scientists' },
  { key: 'A', name: 'Artists' },
  { key: 'B', name: 'Builders' },
  { key: 'C', name: 'Composers' },
  { key: 'D', name: 'Dramatists' },
  { key: 'T', name: 'Towns' },
]

export async function seed(knex: Knex): Promise<void> {
  await knex('category_name').del()
  await knex('category_name').insert(CATEGORY_NAMES)
}
