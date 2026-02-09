const cheerio = require('cheerio');
const axios = require('axios');

const SOURCES = {
  uaserials: {
    baseUrl: 'https://uaserials.org',
    categories: {
      series: '/series/',
      films: '/films/',
      cartoons: '/cartoons/',
      anime: '/anime/'
    }
  }
};

async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 15000
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    throw error;
  }
}

function parseUaserialsListing($) {
  const items = [];

  $('.short-item, .movie-item, .item').each((_, element) => {
    const $el = $(element);
    const $link = $el.find('a').first();
    const $img = $el.find('img').first();
    const $title = $el.find('.short-title, .title, h3, h4').first();

    const url = $link.attr('href') || '';

    // Get poster - prefer src with posters in path, then data-src
    let poster = '';
    const imgSrc = $img.attr('src') || '';
    const imgDataSrc = $img.attr('data-src') || '';

    if (imgSrc.includes('posters')) {
      poster = imgSrc;
    } else if (imgDataSrc.includes('posters')) {
      poster = imgDataSrc;
    } else if (imgSrc && !imgSrc.includes('default')) {
      poster = imgSrc;
    } else if (imgDataSrc) {
      poster = imgDataSrc;
    }

    // Extract ID from URL and construct poster URL if needed
    const idMatch = url.match(/\/(\d+)-/);
    if (!poster && idMatch) {
      poster = `https://uaserials.com/posters/${idMatch[1]}.jpg`;
    }

    const title = $title.text().trim() || $img.attr('alt') || '';

    // Extract full slug from URL (e.g., "853-dyvni-dyva" from "/853-dyvni-dyva.html")
    const slugMatch = url.match(/\/([^\/]+)\.html/);
    const externalId = slugMatch ? slugMatch[1] : url.replace(/[^a-z0-9-]/gi, '_');

    // Try to extract year
    const yearMatch = title.match(/\((\d{4})\)/) || $el.text().match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;

    // Clean title
    const cleanTitle = title.replace(/\(\d{4}\)/, '').trim();

    if (cleanTitle && url) {
      items.push({
        externalId,
        title: cleanTitle,
        year,
        poster: poster.startsWith('http') ? poster : (poster ? 'https://uaserials.com' + poster : ''),
        url: url.startsWith('http') ? url : SOURCES.uaserials.baseUrl + url,
        source: 'uaserials'
      });
    }
  });

  return items;
}

function parseUaserialsDetails($, url) {
  const item = {
    source: 'uaserials',
    url
  };

  // Title - Ukrainian name
  const $titleUa = $('.oname_ua').first();
  item.title = $titleUa.text().trim();

  // Fallback to short-title or h1 if oname_ua is empty
  if (!item.title) {
    const $shortTitle = $('.short-title').first();
    item.title = $shortTitle.text().trim();
  }

  // Original title (English)
  const $origTitle = $('.oname').first();
  item.originalTitle = $origTitle.text().trim() || null;

  // Poster from og:image meta tag
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  item.poster = ogImage;

  // Fallback poster from fimg
  if (!item.poster) {
    const $posterImg = $('.fimg img').first();
    const posterSrc = $posterImg.attr('src') || $posterImg.attr('data-src') || '';
    item.poster = posterSrc.startsWith('http') ? posterSrc : (posterSrc ? SOURCES.uaserials.baseUrl + posterSrc : '');
  }

  // Description
  const $desc = $('.ftext.full-text, .full-text').first();
  item.description = $desc.text().trim();

  // Year from short-list
  const yearText = $('.short-list').text();
  const yearMatch = yearText.match(/Рік[:\s]*(\d{4})/i);
  item.year = yearMatch ? parseInt(yearMatch[1]) : null;

  // Rating from IMDB badge
  const $rating = $('.short-rate-imdb span').first();
  const ratingText = $rating.text().trim();
  item.rating = ratingText ? parseFloat(ratingText) : null;

  // Genres - not easily available, leave empty
  item.genres = [];

  // Countries - not easily available, leave empty
  item.countries = [];

  // Type detection
  item.type = url.includes('/films/') ? 'movie' : 'series';

  // Extract ID from URL
  const idMatch = url.match(/\/([^\/]+)\.html/);
  item.externalId = idMatch ? idMatch[1] : url.replace(/[^a-z0-9-]/gi, '_');

  console.log('Parsed item:', item.title, '| Year:', item.year, '| Rating:', item.rating);

  return item;
}

function parseUaserialsSeasons($) {
  const seasons = [];

  $('.seasons-list .season, .playlists-list .playlist, [data-season]').each((_, element) => {
    const $season = $(element);
    const seasonNum = parseInt($season.attr('data-season') || $season.find('.season-num').text() || seasons.length + 1);
    const title = $season.find('.season-title').text().trim() || `Сезон ${seasonNum}`;

    const episodes = [];
    $season.find('.episode, .episode-item, [data-episode]').each((_, ep) => {
      const $ep = $(ep);
      const epNum = parseInt($ep.attr('data-episode') || $ep.find('.ep-num').text() || episodes.length + 1);
      const epTitle = $ep.find('.ep-title').text().trim() || `Серія ${epNum}`;
      const videoUrl = $ep.attr('data-url') || $ep.find('a').attr('href') || '';

      episodes.push({
        episodeNumber: epNum,
        title: epTitle,
        videoUrl
      });
    });

    seasons.push({
      seasonNumber: seasonNum,
      title,
      episodes
    });
  });

  // If no structured seasons found, try to find video player data
  if (seasons.length === 0) {
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html() || '';
      const playlistMatch = content.match(/playlist\s*[=:]\s*(\[[\s\S]*?\])/);
      if (playlistMatch) {
        try {
          const playlist = JSON.parse(playlistMatch[1].replace(/'/g, '"'));
          if (Array.isArray(playlist)) {
            seasons.push({
              seasonNumber: 1,
              title: 'Сезон 1',
              episodes: playlist.map((ep, idx) => ({
                episodeNumber: idx + 1,
                title: ep.title || `Серія ${idx + 1}`,
                videoUrl: ep.file || ep.url || ''
              }))
            });
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  return seasons;
}

async function parseCatalog(source, category, page = 1) {
  const sourceConfig = SOURCES[source];
  if (!sourceConfig) {
    throw new Error(`Unknown source: ${source}`);
  }

  const categoryPath = sourceConfig.categories[category];
  if (!categoryPath) {
    throw new Error(`Unknown category: ${category}`);
  }

  const url = `${sourceConfig.baseUrl}${categoryPath}${page > 1 ? `page/${page}/` : ''}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  let items = [];
  if (source === 'uaserials') {
    items = parseUaserialsListing($);
  }

  // Extract pagination info
  const lastPageMatch = $('.pagination a:last, .nav-pages a:last').attr('href')?.match(/page\/(\d+)/);
  const totalPages = lastPageMatch ? parseInt(lastPageMatch[1]) : page;

  return {
    items,
    page,
    totalPages,
    hasMore: page < totalPages
  };
}

async function parseItem(source, externalId) {
  const sourceConfig = SOURCES[source];
  if (!sourceConfig) {
    throw new Error(`Unknown source: ${source}`);
  }

  // Try to construct URL from ID
  const url = `${sourceConfig.baseUrl}/${externalId}.html`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  let item = {};
  let seasons = [];

  if (source === 'uaserials') {
    item = parseUaserialsDetails($, url);
    seasons = parseUaserialsSeasons($);
  }

  return { item, seasons };
}

async function searchItems(source, query) {
  const sourceConfig = SOURCES[source];
  if (!sourceConfig) {
    throw new Error(`Unknown source: ${source}`);
  }

  const searchUrl = `${sourceConfig.baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
  const html = await fetchPage(searchUrl);
  const $ = cheerio.load(html);

  let items = [];
  if (source === 'uaserials') {
    items = parseUaserialsListing($);
  }

  return { items, query };
}

module.exports = {
  parseCatalog,
  parseItem,
  searchItems,
  fetchPage,
  SOURCES
};
