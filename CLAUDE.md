# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Backend API + Lampa TV plugin for Ukrainian streaming content. Serves movies, TV series, cartoons, and anime from uaserials.org to the Lampa media player (Android TV).

## Commands

```bash
# Development
cd server && npm run dev          # Start with nodemon (auto-reload)
cd server && npm run migrate      # Run database migrations
cd server && npm run migrate:make # Create new migration

# Production
npm start                         # Start server
pm2 start ecosystem.config.js     # Start with PM2

# Docker
docker-compose up -d db           # Start PostgreSQL only
docker-compose up -d              # Start all services
docker-compose logs -f server     # View logs

# Test API
curl http://localhost:3000/health
curl http://localhost:3000/api/catalog/uaserials/series
```

## Architecture

```
server/
├── index.js              # Express app, routes registration, middleware
├── routes/
│   ├── catalog.js        # GET /api/catalog/:source/:category - paginated listings
│   ├── item.js           # GET /api/item/:source/:id - item details with seasons
│   ├── search.js         # GET /api/search?q=&source= - search
│   └── proxy.js          # GET /proxy?url= - CORS proxy for images/video
├── services/
│   ├── parser.js         # HTML parsing with cheerio (uaserials.org structure)
│   ├── cache.js          # PostgreSQL caching layer with TTL
│   └── browser.js        # Puppeteer video extraction (m3u8/mp4 URLs)
└── db/
    ├── knex.js           # Database connection
    └── migrations/       # Knex migrations

plugin/
└── ua-content.js         # Lampa plugin (ES5 JavaScript for Android TV)
```

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: PostgreSQL 15
- **ORM**: Knex.js (NOT Drizzle)
- **Parser**: cheerio
- **Video extraction**: puppeteer-core (requires Chromium at `/usr/bin/chromium`)
- **Deploy**: Docker Compose or PM2

## API Endpoints

```
GET  /health                              # Health check
GET  /api/catalog/:source/:category       # Catalog listing (pagination via ?page=)
GET  /api/item/:source/:id                # Item details with seasons
GET  /api/video/:source/:id               # Extract video URL
GET  /api/episodes/:source/:id            # Extract all episodes
GET  /api/episode/:source/:id/:s/:e       # Extract specific episode video
GET  /api/search?q=&source=               # Search
GET  /proxy?url=                          # CORS proxy
GET  /proxy/stream?url=                   # Video streaming proxy
GET  /plugin/ua-content.js                # Serve plugin
```

## Database Schema

Four tables: `cached_pages` (HTML cache with TTL), `items` (movies/series), `seasons`, `episodes`. All have cascade delete relationships.

## Key Patterns

**Lampa Plugin (ES5)**:
- Components use `Lampa.Component.add('Name', ComponentFn)`
- Navigation: `Lampa.Activity.push({ component: 'Name', ... })`
- HTTP: `new Lampa.Reguest().silent(url, onSuccess, onError)`
- Remote control: `Lampa.Controller.add('name', { left, right, up, down, back })`
- Common bug: `this.emit is not a function` = wrong `this` context; always save `var comp = this`

**Video Extraction**:
- Uses headless Chromium to intercept m3u8/mp4 network requests
- Falls back to parsing AMSP player JavaScript for playlist data
- Resource-intensive on Raspberry Pi; uses `--single-process` flag

**Source Configuration**:
- Currently only `uaserials` implemented
- Categories: `series`, `films`, `cartoons`, `anime`
- URL pattern: `https://uaserials.org/{category}/` and `/{id}-{slug}.html`

## Environment

- **Raspberry Pi IP**: 192.168.0.195
- **API Port**: 3000 (Docker) or 3001 (PM2)
- **Plugin URL on TV**: `http://192.168.0.195:3001/plugin/ua-content.js`
