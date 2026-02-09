const express = require('express');
const { parseCatalog, SOURCES } = require('../services/parser');
const router = express.Router();

// GET /api/catalog/:source/:category
router.get('/:source/:category', async (req, res) => {
  const { source, category } = req.params;
  const page = parseInt(req.query.page) || 1;

  try {
    // Validate source
    if (!SOURCES[source]) {
      return res.status(400).json({
        error: 'Invalid source',
        availableSources: Object.keys(SOURCES)
      });
    }

    // Validate category
    if (!SOURCES[source].categories[category]) {
      return res.status(400).json({
        error: 'Invalid category',
        availableCategories: Object.keys(SOURCES[source].categories)
      });
    }

    const result = await parseCatalog(source, category, page);

    // Format response for Lampa
    const lampaItems = result.items.map(item => ({
      id: `${source}:${item.externalId}`,
      title: item.title,
      original_title: item.originalTitle || '',
      year: item.year,
      poster: item.poster,
      source,
      type: category === 'films' ? 'movie' : 'tv'
    }));

    res.json({
      results: lampaItems,
      page: result.page,
      total_pages: result.totalPages,
      has_more: result.hasMore
    });
  } catch (error) {
    console.error('Catalog error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch catalog',
      message: error.message
    });
  }
});

// GET /api/catalog/:source - list available categories
router.get('/:source', (req, res) => {
  const { source } = req.params;

  if (!SOURCES[source]) {
    return res.status(400).json({
      error: 'Invalid source',
      availableSources: Object.keys(SOURCES)
    });
  }

  const categories = Object.keys(SOURCES[source].categories).map(cat => ({
    id: cat,
    name: getCategoryName(cat),
    url: `/api/catalog/${source}/${cat}`
  }));

  res.json({ source, categories });
});

// GET /api/catalog - list available sources
router.get('/', (req, res) => {
  const sources = Object.keys(SOURCES).map(source => ({
    id: source,
    name: getSourceName(source),
    url: `/api/catalog/${source}`
  }));

  res.json({ sources });
});

function getCategoryName(category) {
  const names = {
    series: 'Серіали',
    films: 'Фільми',
    cartoons: 'Мультфільми',
    anime: 'Аніме'
  };
  return names[category] || category;
}

function getSourceName(source) {
  const names = {
    uaserials: 'UASerials'
  };
  return names[source] || source;
}

module.exports = router;
