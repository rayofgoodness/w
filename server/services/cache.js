const db = require('../db/knex');

const DEFAULT_TTL = 3600; // 1 hour in seconds

async function getCachedPage(url) {
  try {
    const result = await db('cached_pages')
      .where('url', url)
      .where('expires_at', '>', db.fn.now())
      .first();
    return result?.content || null;
  } catch (error) {
    console.error('Cache get error:', error.message);
    return null;
  }
}

async function setCachedPage(url, content, ttl = DEFAULT_TTL) {
  try {
    await db('cached_pages')
      .insert({
        url,
        content,
        expires_at: db.raw(`NOW() + INTERVAL '${ttl} seconds'`)
      })
      .onConflict('url')
      .merge({
        content,
        expires_at: db.raw(`NOW() + INTERVAL '${ttl} seconds'`),
        created_at: db.fn.now()
      });
  } catch (error) {
    console.error('Cache set error:', error.message);
  }
}

async function cleanExpiredCache() {
  try {
    const count = await db('cached_pages')
      .where('expires_at', '<', db.fn.now())
      .del();
    console.log(`Cleaned ${count} expired cache entries`);
    return count;
  } catch (error) {
    console.error('Cache clean error:', error.message);
    return 0;
  }
}

async function getItem(source, externalId) {
  try {
    const result = await db('items')
      .where('source', source)
      .where('external_id', externalId)
      .first();
    return result || null;
  } catch (error) {
    console.error('Get item error:', error.message);
    return null;
  }
}

async function saveItem(itemData) {
  try {
    const data = {
      source: itemData.source,
      external_id: itemData.externalId,
      title: itemData.title,
      original_title: itemData.originalTitle || null,
      year: itemData.year || null,
      poster: itemData.poster || null,
      description: itemData.description || null,
      genres: itemData.genres || [],
      countries: itemData.countries || [],
      rating: itemData.rating || null,
      type: itemData.type || 'movie',
      url: itemData.url || null
    };

    const result = await db('items')
      .insert(data)
      .onConflict(['source', 'external_id'])
      .merge({
        ...data,
        updated_at: db.fn.now()
      })
      .returning('*');

    return result[0];
  } catch (error) {
    console.error('Save item error:', error.message);
    throw error;
  }
}

async function saveSeasons(itemId, seasons) {
  const savedSeasons = [];

  for (const season of seasons) {
    try {
      const seasonResult = await db('seasons')
        .insert({
          item_id: itemId,
          season_number: season.seasonNumber,
          title: season.title || `Сезон ${season.seasonNumber}`
        })
        .onConflict(['item_id', 'season_number'])
        .merge({ title: season.title || `Сезон ${season.seasonNumber}` })
        .returning('*');

      const savedSeason = seasonResult[0];
      savedSeason.episodes = [];

      if (season.episodes && season.episodes.length > 0) {
        for (const episode of season.episodes) {
          const epResult = await db('episodes')
            .insert({
              season_id: savedSeason.id,
              episode_number: episode.episodeNumber,
              title: episode.title || `Серія ${episode.episodeNumber}`,
              video_url: episode.videoUrl || null
            })
            .onConflict(['season_id', 'episode_number'])
            .merge({
              title: episode.title || `Серія ${episode.episodeNumber}`,
              video_url: episode.videoUrl || null
            })
            .returning('*');
          savedSeason.episodes.push(epResult[0]);
        }
      }

      savedSeasons.push(savedSeason);
    } catch (error) {
      console.error('Save season error:', error.message);
    }
  }

  return savedSeasons;
}

async function getItemWithSeasons(source, externalId) {
  try {
    const item = await getItem(source, externalId);
    if (!item) return null;

    const seasonsResult = await db('seasons')
      .where('item_id', item.id)
      .orderBy('season_number');

    const seasons = [];
    for (const season of seasonsResult) {
      const episodesResult = await db('episodes')
        .where('season_id', season.id)
        .orderBy('episode_number');
      seasons.push({
        ...season,
        episodes: episodesResult
      });
    }

    return { item, seasons };
  } catch (error) {
    console.error('Get item with seasons error:', error.message);
    return null;
  }
}

module.exports = {
  getCachedPage,
  setCachedPage,
  cleanExpiredCache,
  getItem,
  saveItem,
  saveSeasons,
  getItemWithSeasons,
  DEFAULT_TTL
};
