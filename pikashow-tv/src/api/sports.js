import { isSafeHttpUrl } from '../utils/streamingEngines.js';
import { isFavoriteChannel } from './history.js';
import { parseM3U, normalizeChannelKey } from './iptv.js';
import { isPopularLiveChannel, hasWorkingPlayer, applyLiveSourceOverride } from './live.js';

const SPORTS_CACHE_KEY = 'ajo_sports_cache_v3';
const SPORTS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const PLAYLIST_SOURCES = [
  'https://iptv-org.github.io/iptv/categories/sports.m3u'
];

// v3.12.59: REPLACED the whole builtin list. Every amazeyourself/adaptive-
// streams YuppTV URL 404s (repo restructured — 86 files, no Sony/Ten paths).
// Verified-live replacements as of Oct 7 2026, probed 200 OK:
//   - Sony Sports Ten 3 HD etc from cloudplay-sonyliv.pages.dev (pages.dev
//     sabhd.m3u8 was 451 but ten*.m3u8 paths serve fine)
//   - Star Sports Select 1/2, Ten Cricket from 103.151.60.162 (Sri Lanka relay)
//   - DD Sports from the same M3U list the app parses anyway
// Old URLs kept as Server 2 failover where a same-channel URL exists.
const BUILTIN_SPORTS_CHANNELS = [
  {
    id: 'builtin-sp-sonysports1',
    title: 'Sony Sports Ten 1',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'https://sliv.tgaadi.workers.dev/ten1sd.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://sliv.tgaadi.workers.dev/ten1sd.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonysports2',
    title: 'Sony Sports Ten 2',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'https://sliv.tgaadi.workers.dev/ten2sd.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://sliv.tgaadi.workers.dev/ten2sd.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonysports3',
    title: 'Sony Sports Ten 3 Hindi',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-3-in.png',
    url: 'https://sliv.tgaadi.workers.dev/ten3sd.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://sliv.tgaadi.workers.dev/ten3sd.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonysportsselect1',
    title: 'Star Sports Select 1 HD',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-select-1-in.png',
    url: 'http://103.151.60.162:2122/play/a026/index.m3u8?hls',
    players: [{ name: 'Server 1 (HD)', url: 'http://103.151.60.162:2122/play/a026/index.m3u8?hls', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonysportsselect2',
    title: 'Star Sports Select 2 HD',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-select-2-in.png',
    url: 'http://103.151.60.162:2122/play/a027/index.m3u8?hls',
    players: [{ name: 'Server 1 (HD)', url: 'http://103.151.60.162:2122/play/a027/index.m3u8?hls', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonyten1',
    title: 'Sony Sports Ten 1 HD',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'https://sliv.tgaadi.workers.dev/ten1hd.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://sliv.tgaadi.workers.dev/ten1hd.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonyten2',
    title: 'Sony Sports Ten 2 HD',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-2-in.png',
    url: 'https://sliv.tgaadi.workers.dev/ten2hd.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://sliv.tgaadi.workers.dev/ten2hd.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonyten3',
    title: 'Sony Sports Ten 3 Hindi HD',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-3-in.png',
    url: 'https://sliv.tgaadi.workers.dev/ten3hd.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://sliv.tgaadi.workers.dev/ten3hd.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-tencricket',
    title: 'Ten Cricket',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'http://103.151.60.162:2122/play/a0fj/index.m3u8?hls',
    players: [
      { name: 'Server 1 (SD)', url: 'http://103.151.60.162:2122/play/a0fj/index.m3u8?hls', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-sp-ddsports',
    title: 'DD Sports',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s158255_ld_h15_aa.png?lock=720x540',
    url: 'http://103.151.60.162:2122/play/a021/index.m3u8?hls',
    players: [
      { name: 'Server 1 (Official)', url: 'http://103.151.60.162:2122/play/a021/index.m3u8?hls', source: 'hls', quality: '576p' },
      // v3.12.59: probed-live alternates for the same channel (Oct 7 2026)
      { name: 'Server 2 (HD)', url: 'https://mumbai-edge.smartplaytv.in/DDSportsHD/index.m3u8', source: 'hls', quality: '720p' },
      { name: 'Server 3 (HD)', url: 'https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/b17adfe543354fdd8d189b110617cddd/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sp-cricketgold',
    title: 'Cricket Gold',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8', source: 'hls', quality: '1080p' }]
  },
  {
    id: 'builtin-sp-willowsports',
    title: 'Willow Sports',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'https://d36r8jifhgsk5j.cloudfront.net/Willow_TV.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://d36r8jifhgsk5j.cloudfront.net/Willow_TV.m3u8', source: 'hls', quality: '1080p' }]
  },
  {
    id: 'builtin-sp-starsportskhel',
    title: 'Star Sports Khel',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-1-hindi-in.png',
    url: 'https://cdn.buzogezapimuyoku.cc/live/star-sports-1-hindi-hd/index.m3u8',
    players: [{ name: 'Server 1 (SD)', url: 'https://cdn.buzogezapimuyoku.cc/live/star-sports-1-hindi-hd/index.m3u8', source: 'hls', quality: '576p' }]
  },
  {
    id: 'builtin-sp-nbatv',
    title: 'NBA TV',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'http://23.237.104.106:8080/USA_NBA/index.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'http://23.237.104.106:8080/USA_NBA/index.m3u8', source: 'hls', quality: '720p' }]
  },
  {
    id: 'builtin-sp-wwe',
    title: 'WWE Network',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'http://103.151.60.162:2122/play/a00p/index.m3u8?hls',
    players: [{ name: 'Server 1 (HD)', url: 'http://103.151.60.162:2122/play/a00p/index.m3u8?hls', source: 'hls', quality: '1080p' }]
  },
  {
    id: 'builtin-sp-beinxtra',
    title: 'beIN SPORTS XTRA',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8', source: 'hls', quality: '1080p' }]
  }
];


const SPORTS_NAME_PATTERNS = [
  /star\s?sports/i,
  /sony\s?sports/i,          // Sony Sports 1, Sony Sports 2, Sony Sports 3, Sony Sports Select
  /sony\s?(ten|espn)/i,      // Sony Ten 1/2/3/5, Sony ESPN
  /willow/i, /astro\s?cricket/i,
  /tensports?/i, /sports18/i, /dd\s?sports/i, /eurosport/i, /sky\s?sports/i,
  /esp(n|n\s?sports?)/i, /cricket/i, /wwe/i, /nba\s?tv/i,
  /ten\s?[123456]|ten\s?sports/i
];

const SPORTS_GROUP_PATTERNS = [/sport/i, /cricket/i, /football/i, /outdoor/i];

function isSportsChannel(ch) {
  const group = String(ch.category || '');
  const name = String(ch.title || '');
  if (SPORTS_GROUP_PATTERNS.some((p) => p.test(group))) return true;
  return SPORTS_NAME_PATTERNS.some((p) => p.test(name));
}

function readSportsCache() {
  try {
    const raw = localStorage.getItem(SPORTS_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Date.now() - data.savedAt < SPORTS_CACHE_TTL && Array.isArray(data.items)) {
      return data.items;
    }
  } catch (err) {
    console.warn("Error reading sports cache:", err);
  }
  return null;
}

async function fetchLiveSportsInternal() {
  const seen = new Set();
  const events = [];

  // Run NTV API and M3U playlist fetches concurrently in parallel
  const [ntvResult, playlistResults] = await Promise.allSettled([
    (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500); // Fast 3.5s max
      try {
        const response = await fetch('https://ntv.cx/api/get-matches?server=kobra', {
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data?.all) ? data.all : [];
      } catch (err) {
        console.warn("NTV sports API skipped or timed out:", err.message);
        return [];
      } finally {
        clearTimeout(timer);
      }
    })(),
    Promise.allSettled(PLAYLIST_SOURCES.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) return [];
        return parseM3U(await response.text()).filter(isSportsChannel);
      } catch (err) {
        console.warn(`Sports playlist fetch error (${url}):`, err.message);
        return [];
      } finally {
        clearTimeout(timer);
      }
    }))
  ]);

  // 1. Process NTV Live Fixtures
  if (ntvResult.status === 'fulfilled' && Array.isArray(ntvResult.value)) {
    for (const m of ntvResult.value) {
      if (events.length >= 200 || !m || !m.id || !m.title) continue;
      const key = normalizeChannelKey(m.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const isCricket = /cricket/i.test(m.category + ' ' + m.title);
      const watchUrl = `https://ntv.cx/watch/${m.id}`;
      const item = {
        id: `ntv-${m.id}`,
        title: m.title,
        title_en: m.title,
        category: isCricket ? 'Cricket' : /football|soccer/i.test(m.category) ? 'Football' : 'Sports',
        poster: m.poster ? (m.poster.startsWith('http') ? m.poster : `https://ntv.cx${m.poster}`) : '',
        poster_url: m.poster ? (m.poster.startsWith('http') ? m.poster : `https://ntv.cx${m.poster}`) : '',
        is_live: true,
        type: 'live',
        year: 'LIVE',
        url: watchUrl,
        stream_url: watchUrl,
        playable: true,
        server: 'NTV Live Sports',
        players: [{ name: 'NTV Live (HD)', url: watchUrl, source: 'embed', quality: 'HD' }],
        player: [{ name: 'NTV Live (HD)', url: watchUrl, source: 'embed', quality: 'HD' }]
      };
      item.is_favorite = isFavoriteChannel(item);
      events.push(item);
    }
  }

  // 2. Process M3U sports channels
  if (playlistResults.status === 'fulfilled' && Array.isArray(playlistResults.value)) {
    for (const res of playlistResults.value) {
      if (res.status !== 'fulfilled' || !Array.isArray(res.value)) continue;
      for (const ch of res.value) {
        if (events.length >= 200) break;
        if (!ch?.url || !isSafeHttpUrl(ch.url)) continue;
        // v3.12.71: the Sports tab used to show the RAW iptv-org sports.m3u —
        // 900+ international channels, dead Star relays, and no thumbnail data.
        // Apply the same popular-only + working-stream gate as the Live TV wall.
        if (!isPopularLiveChannel({ name: ch.title, lang: ch.lang || '' })) continue;
        if (!hasWorkingPlayer({ url: ch.url, players: [{ url: ch.url }] })) continue;
        const gated = applyLiveSourceOverride({
          title: ch.title,
          title_en: ch.title,
          name: ch.title,
          url: ch.url,
          players: [{ name: 'Server 1 (Live)', url: ch.url, source: 'hls', quality: 'HD' }]
        });
        ch.url = gated.url;
        const key = normalizeChannelKey(ch.title);
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const item = {
          id: ch.id || `sports-${events.length + 1}`,
          title: ch.title,
          title_en: ch.title,
          category: 'Live Sports',
          poster: ch.poster || '',
          poster_url: ch.poster || '',
          url: ch.url,
          stream_url: ch.url,
          is_live: true,
          type: 'live',
          year: 'LIVE',
          players: [{ name: 'Server 1 (Live)', url: ch.url, source: 'hls', quality: 'HD' }],
          player: [{ name: 'Server 1 (Live)', url: ch.url, source: 'hls', quality: 'HD' }]
        };
        item.is_favorite = isFavoriteChannel(item);
        events.push(item);
      }
    }
  }

  // Seed builtin sports channels for titles not already in the live results
  for (const builtin of BUILTIN_SPORTS_CHANNELS) {
    const key = normalizeChannelKey(builtin.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const item = {
      ...builtin,
      title_en: builtin.title,
      is_live: true,
      type: 'live',
      year: 'LIVE',
      player: builtin.players
    };
    item.is_favorite = isFavoriteChannel(item);
    events.push(item);
  }

  if (events.length > 0) {
    try {
      localStorage.setItem(SPORTS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: events }));
    } catch {}
  }

  return events;
}

export async function getLiveSportsEvents() {
  const cached = readSportsCache();
  if (cached && cached.length > 0) {
    // Refresh in background
    fetchLiveSportsInternal().catch(() => {});
    return cached;
  }
  return await fetchLiveSportsInternal();
}
