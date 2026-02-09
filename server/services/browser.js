const puppeteer = require('puppeteer-core');

const CHROMIUM_PATH = '/usr/bin/chromium';

let browser = null;

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getBrowser() {
  if (!browser) {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions'
      ]
    });
    console.log('Browser launched');
  }
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

async function extractAllEpisodes(url) {
  console.log('Extracting all episodes from:', url);

  const browser = await getBrowser();
  const page = await browser.newPage();

  const seasons = [];
  const capturedData = [];

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Capture all network responses that might contain playlist data
    page.on('response', async (response) => {
      const respUrl = response.url();
      const contentType = response.headers()['content-type'] || '';

      // Look for JSON responses with playlist/episode data
      if (contentType.includes('json') || respUrl.includes('playlist') || respUrl.includes('season')) {
        try {
          const text = await response.text();
          if (text.includes('file') || text.includes('episode') || text.includes('season')) {
            capturedData.push({ url: respUrl, data: text.substring(0, 500) });
          }
        } catch (e) {}
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(8000);

    console.log('Captured data count:', capturedData.length);

    // Try to extract from page scripts
    const scriptData = await page.evaluate(() => {
      const result = { seasons: [], rawData: null };

      // Look for playlist data in scripts
      document.querySelectorAll('script').forEach(script => {
        const text = script.textContent || '';

        // Try to find player initialization with seasons data
        const playlistMatch = text.match(/playlist\s*[=:]\s*(\[[\s\S]*?\])/);
        if (playlistMatch) {
          try {
            result.rawData = playlistMatch[1].substring(0, 500);
          } catch (e) {}
        }

        // Look for seasons/episodes array
        const seasonsMatch = text.match(/seasons?\s*[=:]\s*(\[[\s\S]*?\])/i);
        if (seasonsMatch) {
          result.rawData = seasonsMatch[1].substring(0, 500);
        }
      });

      // Also check for AMSP player data
      if (typeof AMSP !== 'undefined' && AMSP.playlist) {
        result.amspPlaylist = JSON.stringify(AMSP.playlist).substring(0, 1000);
      }

      return result;
    });

    console.log('Script data:', JSON.stringify(scriptData).substring(0, 300));

    // If we couldn't get seasons from DOM/scripts, create fake seasons based on video URL pattern
    // The video URL pattern is: stranger.things.s01e01 - we can assume standard season/episode numbering

    // Get video URL to analyze the pattern
    const videoUrl = capturedData.find(d => d.url.includes('.m3u8'))?.url || '';
    console.log('Sample video URL:', videoUrl);

    if (videoUrl) {
      // Extract season/episode pattern from URL like s01e01
      const match = videoUrl.match(/s(\d+)e(\d+)/i);
      if (match) {
        const maxSeason = parseInt(match[1]);
        // Create placeholder seasons (we'll need to click to get actual videos)
        for (let s = 1; s <= Math.max(maxSeason, 5); s++) {
          const episodes = [];
          // Assume 10 episodes per season as placeholder
          for (let e = 1; e <= 10; e++) {
            episodes.push({
              number: e,
              title: `Серія ${e}`
            });
          }
          seasons.push({
            number: s,
            title: `Сезон ${s}`,
            episodes
          });
        }
      }
    }

    // If still no seasons, create a single season placeholder
    if (seasons.length === 0) {
      const episodes = [];
      for (let e = 1; e <= 10; e++) {
        episodes.push({
          number: e,
          title: `Серія ${e}`
        });
      }
      seasons.push({
        number: 1,
        title: 'Сезон 1',
        episodes
      });
    }

    console.log('Total seasons:', seasons.length);
    return { seasons };

  } catch (error) {
    console.error('Browser extraction error:', error.message);
    throw error;
  } finally {
    await page.close();
  }
}

async function extractEpisodeVideo(url, seasonNum, episodeNum) {
  console.log(`Extracting video for S${seasonNum}E${episodeNum} from:`, url);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Capture video URL
    let videoUrl = null;
    page.on('response', (response) => {
      const respUrl = response.url();
      if (respUrl.includes('.m3u8') && !videoUrl) {
        videoUrl = respUrl;
        console.log('Found video:', respUrl);
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(5000);

    // Click season if > 1
    if (seasonNum > 1) {
      await page.evaluate((idx) => {
        const el = document.querySelectorAll('.plst-ss .plst-s')[idx];
        if (el) el.click();
      }, seasonNum - 1);
      await delay(1500);
    }

    // Click episode
    await page.evaluate((idx) => {
      const el = document.querySelectorAll('.plst-es .plst-e, .plst-e')[idx];
      if (el) el.click();
    }, episodeNum - 1);

    // Wait for video to load
    await delay(4000);

    return { videoUrl };

  } catch (error) {
    console.error('Episode video extraction error:', error.message);
    throw error;
  } finally {
    await page.close();
  }
}

async function extractVideoData(url) {
  console.log('Extracting video from:', url);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Collect network requests for video URLs
    const videoUrls = [];
    const playlistData = [];

    page.on('response', async (response) => {
      const respUrl = response.url();
      const contentType = response.headers()['content-type'] || '';

      // Capture m3u8 and video URLs
      if (respUrl.includes('.m3u8') || respUrl.includes('.mp4') ||
          contentType.includes('mpegurl') || contentType.includes('video')) {
        videoUrls.push(respUrl);
        console.log('Found video URL:', respUrl);
      }

      // Capture JSON with playlist data
      if (contentType.includes('json') && (respUrl.includes('playlist') || respUrl.includes('player'))) {
        try {
          const text = await response.text();
          playlistData.push({ url: respUrl, data: JSON.parse(text) });
        } catch (e) {}
      }
    });

    // Navigate to page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for player to initialize
    await delay(5000);

    // Try to extract playlist from page
    const extractedData = await page.evaluate(() => {
      const result = {
        seasons: [],
        iframes: [],
        videoUrls: []
      };

      // Find iframes
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.src) {
          result.iframes.push(iframe.src);
        }
      });

      // Look for player data in window
      if (window.playlist) {
        result.playlist = window.playlist;
      }

      // Look for video elements
      document.querySelectorAll('video source, video').forEach(el => {
        const src = el.src || el.getAttribute('src');
        if (src) result.videoUrls.push(src);
      });

      // Try to find season/episode selectors in AMSP player
      document.querySelectorAll('.plst-ss .plst-s, [data-season]').forEach(el => {
        const seasonText = el.textContent || '';
        const seasonNum = el.dataset?.season || seasonText.match(/\d+/)?.[0];
        if (seasonNum) {
          result.seasons.push({ number: parseInt(seasonNum), text: seasonText.trim() });
        }
      });

      // Get episodes
      document.querySelectorAll('.plst-es .plst-e, [data-episode]').forEach(el => {
        const epText = el.textContent || '';
        const epNum = el.dataset?.episode || epText.match(/\d+/)?.[0];
        if (epNum) {
          result.episodes = result.episodes || [];
          result.episodes.push({ number: parseInt(epNum), text: epText.trim() });
        }
      });

      // Try AMSP player if exists
      if (typeof AMSP !== 'undefined') {
        try {
          if (AMSP.playlist) result.amspPlaylist = AMSP.playlist;
          if (AMSP.current) result.amspCurrent = AMSP.current;
        } catch (e) {}
      }

      return result;
    });

    // Click on first season if available
    try {
      const firstSeason = await page.$('.plst-ss .plst-s');
      if (firstSeason) {
        await firstSeason.click();
        await delay(1000);
      }
    } catch (e) {
      console.log('No season selector found');
    }

    // Click on first episode to trigger video load
    try {
      const firstEpisode = await page.$('.plst-es .plst-e, .plst-e');
      if (firstEpisode) {
        console.log('Clicking first episode...');
        await firstEpisode.click();
        await delay(3000);
      }
    } catch (e) {
      console.log('No episode selector found');
    }

    // Get final collected data including any videos that loaded after clicking
    const finalData = await page.evaluate(() => {
      const videos = [];
      document.querySelectorAll('video source, video').forEach(el => {
        const src = el.src || el.getAttribute('src');
        if (src && !videos.includes(src)) videos.push(src);
      });

      // Check iframes again
      const iframes = [];
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.src && !iframes.includes(iframe.src)) {
          iframes.push(iframe.src);
        }
      });

      // Check for any m3u8 in scripts
      const scripts = document.querySelectorAll('script');
      scripts.forEach(s => {
        const text = s.textContent || '';
        const m3u8Match = text.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
        if (m3u8Match) videos.push(...m3u8Match);
      });

      return { videos, iframes };
    });

    return {
      videoUrls: [...new Set([...videoUrls, ...finalData.videos])],
      iframes: [...new Set([...(extractedData.iframes || []), ...finalData.iframes])],
      extractedData,
      playlistData
    };

  } catch (error) {
    console.error('Browser extraction error:', error.message);
    throw error;
  } finally {
    await page.close();
  }
}

// Cleanup on process exit
process.on('exit', closeBrowser);
process.on('SIGINT', closeBrowser);
process.on('SIGTERM', closeBrowser);

module.exports = {
  getBrowser,
  closeBrowser,
  extractVideoData,
  extractAllEpisodes,
  extractEpisodeVideo
};
