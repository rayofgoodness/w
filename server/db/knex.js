const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || {
    host: 'localhost',
    port: 5432,
    user: 'lampa',
    password: 'lampa_secret',
    database: 'lampa_ua'
  },
  pool: { min: 2, max: 10 }
});

module.exports = db;
