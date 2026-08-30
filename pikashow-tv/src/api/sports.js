import { isSafeHttpUrl } from '../utils/streamingEngines.js';
import { isFavoriteChannel } from './history.js';
import { parseM3U, normalizeChannelKey } from './iptv.js';

const SPORTS_CACHE_KEY = 'ajo_sports_cache_v2';
const SPORTS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const PLAYLIST_SOURCES = [
  'https://iptv-org.github.io/iptv/categories/sports.m3u'
];

// Guaranteed fallback channels — seed the Sports tab when live APIs are slow/empty.
// These are seeded AFTER NTV + M3U results so live data always wins.
const BUILTIN_SPORTS_CHANNELS = [
  {
    id: 'builtin-sp-sonysports1',
    title: 'Sony Sports 1',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySports1.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySports1.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonysports2',
    title: 'Sony Sports 2',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySports2.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySports2.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonysports3',
    title: 'Sony Sports 3',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySports3.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySports3.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonysportsselect1',
    title: 'Sony Sports Select 1',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySportsSelect1.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonySportsSelect1.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonyten1',
    title: 'Sony Ten 1',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-1-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonyTen1.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonyTen1.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonyten2',
    title: 'Sony Ten 2',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-2-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonyTen2.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonyTen2.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-sonyten3',
    title: 'Sony Ten 3',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-ten-3-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonyTen3.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/SonyTen3.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-ddsports',
    title: 'DD Sports',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s158255_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/DDSports.m3u8',
    players: [{ name: 'Server 1 (Official)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/DDSports.m3u8', source: 'hls', quality: '720p' }]
  },
  {
    id: 'builtin-sp-starsports1',
    title: 'Star Sports 1',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-1-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/StarSports1.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/StarSports1.m3u8', source: 'hls', quality: 'HD' }]
  },
  {
    id: 'builtin-sp-starsports2',
    title: 'Star Sports 2',
    category: 'Sports',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-2-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/StarSports2.m3u8',
    players: [{ name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/StarSports2.m3u8', source: 'hls', quality: 'HD' }]
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
