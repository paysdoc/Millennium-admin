/**
 * @param {import('knex').Knex} knex
 */
exports.seed = async function (knex) {
  await knex('category_name').del()

  await knex('category_name').insert([
    { code: 'R', name: 'Royalty' },
    { code: 'S', name: 'Statesmen' },
    { code: 'P', name: 'Philosophers' },
    { code: 'I', name: 'Inventors' },
    { code: 'M', name: 'Mathematical Scientists' },
    { code: 'N', name: 'Natural Scientists' },
    { code: 'A', name: 'Artists' },
    { code: 'B', name: 'Builders' },
    { code: 'C', name: 'Composers' },
    { code: 'D', name: 'Dramatists' },
    { code: 'T', name: 'Towns' },
  ])
}
