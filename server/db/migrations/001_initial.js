exports.up = function(knex) {
  return knex.schema
    .createTable('cached_pages', (table) => {
      table.increments('id').primary();
      table.text('url').unique().notNullable();
      table.text('content').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('expires_at').notNullable();
      table.index('url', 'idx_cached_pages_url');
      table.index('expires_at', 'idx_cached_pages_expires');
    })
    .createTable('items', (table) => {
      table.increments('id').primary();
      table.string('source', 50).notNullable();
      table.string('external_id', 255).notNullable();
      table.string('title', 500).notNullable();
      table.string('original_title', 500);
      table.integer('year');
      table.text('poster');
      table.text('description');
      table.specificType('genres', 'text[]');
      table.specificType('countries', 'text[]');
      table.decimal('rating', 3, 1);
      table.string('type', 50).defaultTo('movie');
      table.text('url');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['source', 'external_id']);
      table.index('source', 'idx_items_source');
      table.index('type', 'idx_items_type');
      table.index('title', 'idx_items_title');
    })
    .createTable('seasons', (table) => {
      table.increments('id').primary();
      table.integer('item_id').references('id').inTable('items').onDelete('CASCADE');
      table.integer('season_number').notNullable();
      table.string('title', 255);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['item_id', 'season_number']);
      table.index('item_id', 'idx_seasons_item');
    })
    .createTable('episodes', (table) => {
      table.increments('id').primary();
      table.integer('season_id').references('id').inTable('seasons').onDelete('CASCADE');
      table.integer('episode_number').notNullable();
      table.string('title', 255);
      table.text('video_url');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['season_id', 'episode_number']);
      table.index('season_id', 'idx_episodes_season');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('episodes')
    .dropTableIfExists('seasons')
    .dropTableIfExists('items')
    .dropTableIfExists('cached_pages');
};
