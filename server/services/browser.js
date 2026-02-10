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
  let decryptedPlaylist = null;

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Capture data-tag1 from HTML response
    let tag1Data = null;
    await page.setRequestInterception(true);
    page.on('request', req => req.continue());
    page.on('response', async (response) => {
      if (response.url() === url) {
        try {
          const html = await response.text();
          const match = html.match(/data-tag1='([^']+)'/);
          if (match) {
            tag1Data = match[1];
            console.log('Captured data-tag1, length:', tag1Data.length);
          }
        } catch (e) {}
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(5000);

    // Try to decrypt playlist using page's CryptoJSAesDecrypt
    // KEY LOCATION: The decryption key is stored in JavaScript variable `dd` on the page
    // As of 2025-02: dd = '297796CCB81D25512'
    // The key is defined in the page's inline scripts and used with CryptoJSAesDecrypt function
    // If decryption fails, the key may have changed - check the page source for new `dd` value
    if (tag1Data) {
      const decryptResult = await page.evaluate((encrypted) => {
        if (typeof CryptoJSAesDecrypt === 'function' && typeof dd !== 'undefined') {
          try {
            const decrypted = CryptoJSAesDecrypt(dd, encrypted);
            return { success: true, data: decrypted, key: dd };
          } catch(e) {
            return { success: false, error: e.message, key: typeof dd !== 'undefined' ? dd : null };
          }
        }
        return { success: false, error: 'CryptoJSAesDecrypt or dd not found' };
      }, tag1Data);

      if (decryptResult.success) {
        decryptedPlaylist = decryptResult.data;
        console.log('Decryption key (dd):', decryptResult.key);
      } else {
        console.error('Decryption failed:', decryptResult.error);
        console.log('Current key (dd):', decryptResult.key);
        console.log('KEY MAY HAVE CHANGED! Check page source for new dd value.');
      }

      if (decryptedPlaylist) {
        console.log('Decrypted playlist successfully');
        try {
          const playlist = JSON.parse(decryptedPlaylist);
          // Parse playlist structure: [{tabName, seasons: [{title, episodes: [{title, sounds: [{url}]}]}]}]
          for (const tab of playlist) {
            if (tab.seasons && Array.isArray(tab.seasons)) {
              for (let si = 0; si < tab.seasons.length; si++) {
                const season = tab.seasons[si];
                const episodes = [];

                if (season.episodes && Array.isArray(season.episodes)) {
                  for (let ei = 0; ei < season.episodes.length; ei++) {
                    const ep = season.episodes[ei];
                    // Get VOD URL from sounds array
                    let vodUrl = null;
                    if (ep.sounds && ep.sounds.length > 0) {
                      vodUrl = ep.sounds[0].url;
                    }
                    episodes.push({
                      number: ei + 1,
                      title: ep.title || `Серія ${ei + 1}`,
                      vodUrl: vodUrl
                    });
                  }
                }

                seasons.push({
                  number: si + 1,
                  title: season.title || `Сезон ${si + 1}`,
                  episodes
                });
              }
            }
          }
          console.log(`Parsed ${seasons.length} seasons from decrypted playlist`);
        } catch (e) {
          console.error('Failed to parse decrypted playlist:', e.message);
        }
      }
    }

    // Fallback: get season count from page title
    if (seasons.length === 0) {
      const titleSeasons = await page.evaluate(() => {
        const title = document.title || '';
        const rangeMatch = title.match(/(\d+)-(\d+)\s*сезон/i);
        if (rangeMatch) return parseInt(rangeMatch[2]);
        const listMatch = title.match(/([\d,\s]+)\s*сезон/i);
        if (listMatch) {
          const nums = listMatch[1].match(/\d+/g);
          if (nums) return Math.max(...nums.map(n => parseInt(n)));
        }
        return 0;
      });

      console.log('Seasons from title:', titleSeasons);

      if (titleSeasons > 0) {
        for (let s = 1; s <= titleSeasons; s++) {
          const episodes = [];
          for (let e = 1; e <= 24; e++) {
            episodes.push({ number: e, title: `Серія ${e}` });
          }
          seasons.push({ number: s, title: `Сезон ${s}`, episodes });
        }
        console.log(`Created ${titleSeasons} seasons from title`);
      }
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

    // Capture data-tag1 from HTML
    let tag1Data = null;
    await page.setRequestInterception(true);
    page.on('request', req => req.continue());
    page.on('response', async (response) => {
      if (response.url() === url) {
        try {
          const html = await response.text();
          const match = html.match(/data-tag1='([^']+)'/);
          if (match) tag1Data = match[1];
        } catch (e) {}
      }
    });

    // Track captured video URLs
    let capturedVideoUrl = null;
    page.on('response', (response) => {
      const respUrl = response.url();
      if (respUrl.includes('.m3u8')) {
        capturedVideoUrl = respUrl;
        console.log('Captured video:', respUrl);
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(5000);

    // Try to get VOD URL from decrypted playlist
    // KEY LOCATION: See extractAllEpisodes for key documentation
    let vodUrl = null;
    if (tag1Data) {
      const result = await page.evaluate((encrypted, sNum, eNum) => {
        if (typeof CryptoJSAesDecrypt === 'function' && typeof dd !== 'undefined') {
          try {
            const decrypted = CryptoJSAesDecrypt(dd, encrypted);
            const playlist = JSON.parse(decrypted);
            for (const tab of playlist) {
              if (tab.seasons && tab.seasons[sNum - 1]) {
                const season = tab.seasons[sNum - 1];
                if (season.episodes && season.episodes[eNum - 1]) {
                  const ep = season.episodes[eNum - 1];
                  if (ep.sounds && ep.sounds.length > 0) {
                    return { vodUrl: ep.sounds[0].url, key: dd };
                  }
                }
              }
            }
            return { vodUrl: null, key: dd, error: 'Episode not found in playlist' };
          } catch(e) {
            return { vodUrl: null, key: dd, error: e.message };
          }
        }
        return { vodUrl: null, error: 'CryptoJSAesDecrypt or dd not found' };
      }, tag1Data, seasonNum, episodeNum);

      console.log('Decryption result:', result);
      if (result.key) {
        console.log('Decryption key (dd):', result.key);
      }
      if (result.error) {
        console.log('KEY MAY HAVE CHANGED! Error:', result.error);
      }
      vodUrl = result.vodUrl;
    }

    if (vodUrl) {
      console.log('Got VOD URL from playlist:', vodUrl);
      // Extract video from VOD page
      const vodPage = await browser.newPage();
      try {
        await vodPage.setViewport({ width: 1920, height: 1080 });
        await vodPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        let videoUrl = null;
        vodPage.on('response', (response) => {
          const respUrl = response.url();
          if (respUrl.includes('.m3u8') && !videoUrl) {
            videoUrl = respUrl;
            console.log('VOD page captured m3u8:', respUrl);
          }
        });

        console.log('Navigating to VOD page:', vodUrl);
        await vodPage.goto(vodUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(5000);

        if (videoUrl) {
          console.log('Final video URL from VOD:', videoUrl);
          return { videoUrl };
        }
        console.log('No m3u8 found on VOD page, checking for iframe...');

        // Try to find video in iframe on VOD page
        const vodIframe = await vodPage.evaluate(() => {
          const iframe = document.querySelector('iframe');
          return iframe ? iframe.src : null;
        });

        if (vodIframe) {
          console.log('Found iframe on VOD page:', vodIframe);
          // Navigate to iframe URL
          await vodPage.goto(vodIframe, { waitUntil: 'networkidle2', timeout: 30000 });
          await delay(3000);

          if (videoUrl) {
            console.log('Final video URL from VOD iframe:', videoUrl);
            return { videoUrl };
          }
        }
      } catch (vodError) {
        console.error('VOD page error:', vodError.message);
      } finally {
        await vodPage.close();
      }
    }

    console.log('Fallback: using captured video URL');

    // Wait for new video URL to be captured
    if (capturedVideoUrl) {
      console.log('Final video URL:', capturedVideoUrl);

      // Check if we got the correct episode or just the default S01E01
      const isDefaultEpisode = capturedVideoUrl.includes('s01e01') && (seasonNum !== 1 || episodeNum !== 1);

      if (isDefaultEpisode) {
        console.log('Warning: Could not select specific episode, returning S01E01');
        return {
          videoUrl: capturedVideoUrl,
          warning: 'Конкретна серія недоступна. Відтворюється S01E01.',
          requestedSeason: seasonNum,
          requestedEpisode: episodeNum
        };
      }

      return { videoUrl: capturedVideoUrl };
    }

    // Fallback: try to get video from iframe
    const iframeSrc = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="ashdi"], iframe[src*="tortuga"], iframe');
      return iframe ? iframe.src : null;
    });

    if (iframeSrc) {
      console.log('Found iframe:', iframeSrc);
      return { videoUrl: null, iframeSrc };
    }

    return { videoUrl: null, error: 'No video found' };

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
