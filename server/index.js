const express = require('express');
const cors = require('cors');
const path = require('path');

const catalogRoutes = require('./routes/catalog');
const itemRoutes = require('./routes/item');
const searchRoutes = require('./routes/search');
const proxyRoutes = require('./routes/proxy');
const { cleanExpiredCache } = require('./services/cache');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Debug log endpoint
app.get('/log', (req, res) => {
  const msg = req.query.msg || '';
  console.log('[TV LOG]', msg);
  res.json({ ok: true });
});

// Video extraction endpoint (quick - single video)
app.get('/api/video/:source/:id', async (req, res) => {
  const { source, id } = req.params;

  try {
    const { extractVideoData } = require('./services/browser');
    const { SOURCES } = require('./services/parser');

    const sourceConfig = SOURCES[source];
    if (!sourceConfig) {
      return res.status(400).json({ error: 'Invalid source' });
    }

    const url = `${sourceConfig.baseUrl}/${id}.html`;
    console.log('Extracting video from:', url);

    const data = await extractVideoData(url);
    res.json(data);
  } catch (error) {
    console.error('Video extraction error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Episodes extraction endpoint (slower - all seasons/episodes)
app.get('/api/episodes/:source/:id', async (req, res) => {
  const { source, id } = req.params;

  try {
    const { extractAllEpisodes } = require('./services/browser');
    const { SOURCES } = require('./services/parser');

    const sourceConfig = SOURCES[source];
    if (!sourceConfig) {
      return res.status(400).json({ error: 'Invalid source' });
    }

    const url = `${sourceConfig.baseUrl}/${id}.html`;
    console.log('Extracting episodes from:', url);

    const data = await extractAllEpisodes(url);
    res.json(data);
  } catch (error) {
    console.error('Episodes extraction error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Single episode video extraction
app.get('/api/episode/:source/:id/:season/:episode', async (req, res) => {
  const { source, id, season, episode } = req.params;

  try {
    const { extractEpisodeVideo } = require('./services/browser');
    const { SOURCES } = require('./services/parser');

    const sourceConfig = SOURCES[source];
    if (!sourceConfig) {
      return res.status(400).json({ error: 'Invalid source' });
    }

    const url = `${sourceConfig.baseUrl}/${id}.html`;
    console.log(`Extracting S${season}E${episode} from:`, url);

    const data = await extractEpisodeVideo(url, parseInt(season), parseInt(episode));
    res.json(data);
  } catch (error) {
    console.error('Episode video extraction error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API Routes
app.use('/api/catalog', catalogRoutes);
app.use('/api/item', itemRoutes);
app.use('/api/search', searchRoutes);
app.use('/proxy', proxyRoutes);

// Static files for plugin
app.use('/plugin', express.static(path.join(__dirname, '../plugin')));

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'Lampa UA Backend',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      catalog: '/api/catalog/:source/:category',
      item: '/api/item/:source/:id',
      search: '/api/search?q=&source=',
      proxy: '/proxy?url='
    },
    sources: ['uaserials'],
    categories: {
      uaserials: ['series', 'films', 'cartoons', 'anime']
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lampa UA Backend running on http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API info: http://localhost:${PORT}/api`);
});

// Periodic cache cleanup (every hour)
setInterval(() => {
  cleanExpiredCache().catch(console.error);
}, 3600000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});
