const express = require('express');
const { parseItem, SOURCES } = require('../services/parser');
const { getItemWithSeasons, saveItem, saveSeasons } = require('../services/cache');
const router = express.Router();

// GET /api/item/:source/:id
router.get('/:source/:id', async (req, res) => {
  const { source, id } = req.params;
  const refresh = req.query.refresh === 'true';

  try {
    // Validate source
    if (!SOURCES[source]) {
      return res.status(400).json({
        error: 'Invalid source',
        availableSources: Object.keys(SOURCES)
      });
    }

    // Try to get from cache first
    if (!refresh) {
      const cached = await getItemWithSeasons(source, id);
      if (cached) {
        return res.json(formatForLampa(cached.item, cached.seasons, source));
      }
    }

    // Parse from source
    const { item, seasons } = await parseItem(source, id);

    // Save to cache
    const savedItem = await saveItem(item);
    let savedSeasons = [];
    if (seasons.length > 0 && savedItem) {
      savedSeasons = await saveSeasons(savedItem.id, seasons);
    }

    res.json(formatForLampa(savedItem || item, savedSeasons.length > 0 ? savedSeasons : seasons, source));
  } catch (error) {
    console.error('Item error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch item',
      message: error.message
    });
  }
});

function formatForLampa(item, seasons, source) {
  const result = {
    id: `${source}:${item.external_id || item.externalId}`,
    title: item.title,
    original_title: item.original_title || item.originalTitle || '',
    year: item.year,
    poster: item.poster,
    overview: item.description,
    genres: (item.genres || []).map(g => ({ name: g })),
    countries: (item.countries || []).map(c => ({ name: c })),
    vote_average: item.rating,
    source,
    type: item.type === 'movie' ? 'movie' : 'tv'
  };

  // Add seasons for series
  if (seasons && seasons.length > 0) {
    result.seasons = seasons.map(season => ({
      season_number: season.season_number || season.seasonNumber,
      name: season.title,
      episodes: (season.episodes || []).map(ep => ({
        episode_number: ep.episode_number || ep.episodeNumber,
        name: ep.title,
        video_url: ep.video_url || ep.videoUrl
      }))
    }));
  }

  return result;
}

module.exports = router;
