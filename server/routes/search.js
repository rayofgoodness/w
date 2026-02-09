const express = require('express');
const { searchItems, SOURCES } = require('../services/parser');
const router = express.Router();

// GET /api/search?q=&source=
router.get('/', async (req, res) => {
  const { q, query, source } = req.query;
  const searchQuery = q || query;

  if (!searchQuery) {
    return res.status(400).json({ error: 'Search query is required (use q or query parameter)' });
  }

  const targetSource = source || 'uaserials';

  try {
    // Validate source
    if (!SOURCES[targetSource]) {
      return res.status(400).json({
        error: 'Invalid source',
        availableSources: Object.keys(SOURCES)
      });
    }

    const result = await searchItems(targetSource, searchQuery);

    // Format response for Lampa
    const lampaItems = result.items.map(item => ({
      id: `${targetSource}:${item.externalId}`,
      title: item.title,
      original_title: item.originalTitle || '',
      year: item.year,
      poster: item.poster,
      source: targetSource,
      type: 'movie' // Will be determined more accurately when item is fetched
    }));

    res.json({
      results: lampaItems,
      query: result.query
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

// Search across all sources
router.get('/all', async (req, res) => {
  const { q, query } = req.query;
  const searchQuery = q || query;

  if (!searchQuery) {
    return res.status(400).json({ error: 'Search query is required (use q or query parameter)' });
  }

  try {
    const allResults = [];

    // Search in all sources
    for (const source of Object.keys(SOURCES)) {
      try {
        const result = await searchItems(source, searchQuery);
        const items = result.items.map(item => ({
          id: `${source}:${item.externalId}`,
          title: item.title,
          original_title: item.originalTitle || '',
          year: item.year,
          poster: item.poster,
          source,
          type: 'movie'
        }));
        allResults.push(...items);
      } catch (e) {
        console.error(`Search error for source ${source}:`, e.message);
      }
    }

    res.json({
      results: allResults,
      query: searchQuery
    });
  } catch (error) {
    console.error('Search all error:', error.message);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

module.exports = router;
