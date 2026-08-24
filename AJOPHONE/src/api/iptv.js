import { isFavoriteChannel } from './history.js';
import { isSafeHttpUrl } from '../utils/streamingEngines.js';

const CACHE_KEY = 'ajo_iptv_cache_v4'; // v4: Full India Lineup + Sony SAB, Sony Sports Ten, Star Sports & all regional feeds
const CUSTOM_KEY = 'ajo_custom_m3u_v2';
const JIOTV_KEY = 'ajo_jiotv_host_v2';
const CACHE_TTL = 30 * 60 * 1000;

// All Indian & global sports/entertainment playlists
const PLAYLISTS = [
  'https://iptv-org.github.io/iptv/countries/in.m3u',              // India Full (~750+ channels: Hindi, Marathi, South, News, Entertainment)
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u', // Direct stream mirrors for India
  'https://iptv-org.github.io/iptv/languages/hin.m3u',             // Hindi Full (~336 channels)
  'https://iptv-org.github.io/iptv/languages/mar.m3u',             // Marathi Full (~31 channels)
  'https://iptv-org.github.io/iptv/categories/sports.m3u',          // Sports Full (Cricket, Football, Ten, Star)
  'https://iptv-org.github.io/iptv/categories/news.m3u',            // News Full
  'https://iptv-org.github.io/iptv/categories/movies.m3u',          // Movies Full
  'https://iptv-org.github.io/iptv/categories/music.m3u',           // Music Full
  'https://iptv-org.github.io/iptv/categories/entertainment.m3u'    // Entertainment Full
];

// Built-in curated premium channels with direct verified multi-server mirrors
const BUILTIN_INDIAN_CHANNELS = [
  // --- SONY ENTERTAINMENT & SPORTS NETWORK ---
  {
    id: 'sony-sab-hd',
    title: 'Sony SAB HD',
    category: 'Entertainment',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Sony_SAB_logo_2022.svg/512px-Sony_SAB_logo_2022.svg.png',
    url: 'http://38.96.178.205/SONYSAB/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'http://38.96.178.205/SONYSAB/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: High-Speed Mirror', url: 'http://103.213.31.109:90/SonySabHD/playlist.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3: Fast CDN', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+SAB+HD.m3u8', source: 'hls', quality: '720p' },
      { name: 'Server 4: Live Mirror', url: 'http://103.72.101.252:8080/live/1321.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-sports-ten-1-hd',
    title: 'Sony Sports Ten 1 HD',
    category: 'Sports',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Sony_Sports_Ten_1_logo.svg/512px-Sony_Sports_Ten_1_logo.svg.png',
    url: 'http://38.96.178.205/SONYTEN1/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'http://38.96.178.205/SONYTEN1/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: High-Speed Mirror', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+TEN+1+HD.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3: Live CDN', url: 'http://103.72.101.252:8080/live/1340.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-sports-ten-2-hd',
    title: 'Sony Sports Ten 2 HD',
    category: 'Sports',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Sony_Sports_Ten_2_logo.svg/512px-Sony_Sports_Ten_2_logo.svg.png',
    url: 'http://38.96.178.205/SONYTEN2/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'http://38.96.178.205/SONYTEN2/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: High-Speed Mirror', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+TEN+2+HD.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3: Live CDN', url: 'http://103.72.101.252:8080/live/1341.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-sports-ten-3-hd',
    title: 'Sony Sports Ten 3 HD (Hindi)',
    category: 'Sports',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Sony_Sports_Ten_3_logo.svg/512px-Sony_Sports_Ten_3_logo.svg.png',
    url: 'http://38.96.178.205/SONYTEN3/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p (Hindi)', url: 'http://38.96.178.205/SONYTEN3/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: High-Speed Mirror', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+TEN+3+HD.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3: Live CDN', url: 'http://103.72.101.252:8080/live/1342.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-sports-ten-5-hd',
    title: 'Sony Sports Ten 5 HD',
    category: 'Sports',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Sony_Sports_Ten_5_logo.svg/512px-Sony_Sports_Ten_5_logo.svg.png',
    url: 'http://38.96.178.205/SONYTEN5/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'http://38.96.178.205/SONYTEN5/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: High-Speed Mirror', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+SIX+HD.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3: Live CDN', url: 'http://103.72.101.252:8080/live/1343.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-tv-hd',
    title: 'Sony Entertainment Television HD (SET)',
    category: 'Entertainment',
    poster: 'https://dtil.tmsimg.com/assets/s159096_ld_h15_aa.png?lock=720x540',
    url: 'http://38.96.178.205/SONYHD/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'http://38.96.178.205/SONYHD/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: Cloud Mirror', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+HD.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3: Live CDN', url: 'http://103.72.101.252:8080/live/1320.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-max-hd',
    title: 'Sony Max HD',
    category: 'Movies',
    poster: 'https://dtil.tmsimg.com/assets/s179440_ld_h15_aa.png?lock=720x540',
    url: 'http://38.96.178.205/SONYMAX/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'http://38.96.178.205/SONYMAX/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: Fast Mirror', url: 'http://103.159.180.34:5001/live/3418.m3u8', source: 'hls', quality: '720p' },
      { name: 'Server 3: Live CDN', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+MAX+HD.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'sony-pix-hd',
    title: 'Sony Pix HD',
    category: 'Movies',
    poster: 'https://i.postimg.cc/Z5G8j67L/PIX-HD-WHITE.png',
    url: 'https://sl.vodep39240327.workers.dev/channel/SONY+PIX+HD.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+PIX+HD.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: Live CDN', url: 'http://103.72.101.252:8080/live/1323.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-marathi-hd',
    title: 'Sony Marathi HD',
    category: 'Entertainment',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_MARATHI/images/LOGO_HD/image.png',
    url: 'https://sl.vodep39240327.workers.dev/channel/SONY+MARATHI.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+MARATHI.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: Live CDN', url: 'http://103.72.101.252:8080/live/1325.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-wah',
    title: 'Sony Wah',
    category: 'Movies',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_WAH/images/LOGO_HD/image.png',
    url: 'https://sl.vodep39240327.workers.dev/channel/SONY+WAH.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'https://sl.vodep39240327.workers.dev/channel/SONY+WAH.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: Live CDN', url: 'http://103.72.101.252:8080/live/1327.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'sony-yay',
    title: 'Sony Yay!',
    category: 'Kids',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_YAY/images/LOGO_HD/image.png',
    url: 'https://s3.itcnbd.live/channel/b22941f1341d7243.m3u8',
    players: [
      { name: 'Server 1: Direct Live', url: 'https://s3.itcnbd.live/channel/b22941f1341d7243.m3u8', source: 'hls', quality: '720p' }
    ]
  },

  // --- STAR NETWORK & SPORTS ---
  {
    id: 'star-sports-1-hd',
    title: 'Star Sports 1 HD',
    category: 'Sports',
    poster: 'https://i.imgur.com/E5jjKHI.png',
    url: 'http://41.205.93.154/STARSPORTS1/index.m3u8',
    players: [
      { name: 'Server 1: Direct 1080p', url: 'http://41.205.93.154/STARSPORTS1/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2: High-Speed Mirror', url: 'https://tvsen7.aynaott.com/sspts1/index.m3u8', source: 'hls', quality: '720p' },
      { name: 'Server 3: Live CDN', url: 'http://103.253.18.58:8000/play/a00m', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'star-sports-1-hindi-hd',
    title: 'Star Sports 1 Hindi HD',
    category: 'Sports',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_STAR_SPORTS_1_HD_HINDI/images/LOGO_HD/image.png',
    url: 'http://103.253.18.58:8000/play/a00t',
    players: [
      { name: 'Server 1: Direct 1080p (Hindi)', url: 'http://103.253.18.58:8000/play/a00t', source: 'hls', quality: '1080p' },
      { name: 'Server 2: High-Speed Mirror', url: 'http://103.253.18.58:8000/play/a03o', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'star-sports-2-hd',
    title: 'Star Sports 2 HD',
    category: 'Sports',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_STAR_SPORTS_2/images/LOGO_HD/image.png',
    url: 'https://tvsen7.aynaott.com/ssport2hd/index.m3u8',
    players: [
      { name: 'Server 1: Direct HD', url: 'https://tvsen7.aynaott.com/ssport2hd/index.m3u8', source: 'hls', quality: '720p' },
      { name: 'Server 2: High-Speed Mirror', url: 'http://tvsen5.aynascope.net/cXPB2LKkErN9/index.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'star-sports-select-1-hd',
    title: 'Star Sports Select 1 HD',
    category: 'Sports',
    poster: 'https://i.imgur.com/Mh9tKPx.png',
    url: 'http://tvsen7.aynascope.net/sspts1/index.m3u8',
    players: [
      { name: 'Server 1: Direct HD', url: 'http://tvsen7.aynascope.net/sspts1/index.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'star-sports-select-2-hd',
    title: 'Star Sports Select 2 HD',
    category: 'Sports',
    poster: 'https://i.imgur.com/FtRT73R.png',
    url: 'http://tvsen7.aynascope.net/ssport2hd/index.m3u8',
    players: [
      { name: 'Server 1: Direct HD', url: 'http://tvsen7.aynascope.net/ssport2hd/index.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'dd-sports-hd',
    title: 'DD Sports HD',
    category: 'Sports',
    poster: 'https://ltsk-cdn.s3.eu-west-1.amazonaws.com/jumpstart/Temp_Live/cdn/HLS/Channel/transparentImages/DD%20Sports.png',
    url: 'https://cdn-3.pishow.tv/live/30/master.m3u8',
    players: [
      { name: 'Server 1: Direct Live', url: 'https://cdn-3.pishow.tv/live/30/master.m3u8', source: 'hls', quality: '720p' }
    ]
  }
];

// Most-wanted channels float to the FRONT of the grid.
const PRIORITY_CHANNEL_RE = [
  /sony\s*(sab|pal|entertainment|tv|max|wah|pix|yay|marathi|sports|ten|bbc|earth)/i,
  /sab\s*tv/i,
  /star\s*(sports|plus|gold|bharat|pravah|utsav|select)/i,
  /sports\s*18|sports18|eurosport|willow|astro\s*cricket|dd\s*sports/i,
  /zee\s*(marathi|24\s*taas|talkies|cinema|tv|anmol|bollywood|yuva|zest|news|keralam|telugu|tamil|bangla|punjabi)/i,
  /colors\s*(marathi|cineplex|cineplex\s*bollywood|hd|infinity|gujarati|kannada|tamil|bangla)/i,
  /star\s*(pravah|pravah\s*picture|plus|gold|bharat|sports|vijay|maa|jalsha|suvarna)/i,
  /abp\s*(majha|news|ganga|asmit|ananda)/i,
  /news18\s*(lokmat|marathi|india|urdu|rajasthan|bihar|up|mp|punjab|gujarati|kannada|tamil|telugu|assam)/i,
  /tv9\s*(marathi|bharatvarsh|telugu|kannada|gujarati|bangla)/i,
  /saam\s*tv|jai\s*maharashtra|fakt\s*marathi|sangeet\s*marathi|shemaroo\s*marathi|ndtv\s*marathi/i,
  /\baaj\s*tak\b|\bindia\s*today\b|ndtv|\bnews\b.*hindi|republic\s*(tv|bharat)|india\s*tv/i,
  /dd\s*(sports|national|news|retro|kisan|bharati|sahyadri|india|girnar|yadagiri|chandana|saptagiri|malayalam|bangla|punjabi|kashir)/i,
  /dangal|shemaroo|goldmines|b4u|9x|mastiii|zoom|mtv|bindass|zing/i
];

function priorityRank(title) {
  const t = String(title || '');
  for (let i = 0; i < PRIORITY_CHANNEL_RE.length; i++) {
    if (PRIORITY_CHANNEL_RE[i].test(t)) return i;
  }
  return PRIORITY_CHANNEL_RE.length;
}

export function isBlockedChannelTitle(title) {
  // Allow all Indian channels!
  return false;
}

export function channelPriority(title) {
  return priorityRank(title);
}

function cleanChannelTitle(title) {
  return String(title || '')
    .replace(/\s*\(\d+p\)/gi, '')
    .replace(/\s*\[Not 24\/7\]/gi, '')
    .replace(/\s*\[Geo-blocked\]/gi, '')
    .trim();
}

async function fetchText(url, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

export function normalizeChannelItem(channel, index = 0) {
  if (!channel?.url || !isSafeHttpUrl(channel.url)) return null;
  const rawTitle = channel.title || channel.name || `Channel ${index + 1}`;
  const displayTitle = cleanChannelTitle(rawTitle);

  const item = {
    id: channel.id || `channel-${index + 1}`,
    title: displayTitle,
    title_en: displayTitle,
    category: channel.category || 'Live TV',
    poster: channel.poster || channel.poster_url || '',
    poster_url: channel.poster_url || channel.poster || '',
    url: channel.url,
    is_live: true,
    type: 'live',
    year: 'LIVE',
    provider: channel.provider || null,
    players: Array.isArray(channel.players) && channel.players.length > 0
      ? channel.players
      : [{ name: channel.quality ? `Server 1 (${channel.quality})` : 'Server 1 (Auto)', url: channel.url, source: 'hls', quality: channel.quality || null, headers: channel.headers || {} }]
  };
  item.player = item.players;
  item.is_favorite = isFavoriteChannel(item);
  return item;
}

export function parseM3U(content) {
  if (!content) return [];
  const channels = [];
  let pending = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const attr = name => line.match(new RegExp(name + '="([^"]*)"', 'i'))?.[1] || '';
      pending = { id: attr('tvg-id'), poster: attr('tvg-logo'), category: attr('group-title') || 'Live TV', title: line.slice(line.lastIndexOf(',') + 1).trim() };
    } else if (pending && /^https?:\/\//i.test(line)) {
      pending.url = line;
      channels.push(pending);
      pending = null;
    }
  }
  return channels;
}

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return value && Date.now() - value.savedAt < CACHE_TTL && Array.isArray(value.items) ? value.items : null;
  } catch { return null; }
}

async function fetchAndBuildChannels(previousItems) {
  const custom = localStorage.getItem(CUSTOM_KEY);
  const urls = [...(custom && isSafeHttpUrl(custom) ? [custom] : []), ...PLAYLISTS];

  let results = await Promise.allSettled(urls.map(url => fetchText(url)));
  const failedIdx = [];
  results.forEach((r, i) => { if (r.status !== 'fulfilled') failedIdx.push(i); });
  if (failedIdx.length > 0) {
    const retried = await Promise.allSettled(failedIdx.map(i => fetchText(urls[i], 25000)));
    failedIdx.forEach((origIdx, j) => { results[origIdx] = retried[j]; });
  }

  // Deduplicate by clean channel title and aggregate multiple streams as failover mirrors
  const byTitle = new Map();

  // First seed with built-in high-priority Indian channels
  for (const builtin of BUILTIN_INDIAN_CHANNELS) {
    const normalized = normalizeChannelItem(builtin, byTitle.size);
    if (normalized) {
      const titleKey = normalized.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (titleKey) byTitle.set(titleKey, normalized);
    }
  }

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const channel of parseM3U(result.value)) {
      const normalized = normalizeChannelItem(channel, byTitle.size);
      if (!normalized) continue;
      const titleKey = normalized.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!titleKey) continue;

      if (byTitle.has(titleKey)) {
        const existing = byTitle.get(titleKey);
        // If this stream URL isn't already in players, add as next backup server
        if (!existing.players.some(p => p.url.toLowerCase() === normalized.url.toLowerCase())) {
          const srvNum = existing.players.length + 1;
          const srvObj = {
            name: `Server ${srvNum} (HD)`,
            url: normalized.url,
            source: 'hls',
            quality: 'HD',
            headers: channel.headers || {}
          };
          existing.players.push(srvObj);
          existing.player = existing.players;
        }
        if (!existing.poster && normalized.poster) {
          existing.poster = normalized.poster;
          existing.poster_url = normalized.poster;
        }
      } else {
        byTitle.set(titleKey, normalized);
      }
    }
  }

  // Preserve previous items if missing
  for (const prev of previousItems) {
    const titleKey = String(prev?.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!titleKey || byTitle.has(titleKey)) continue;
    byTitle.set(titleKey, prev);
  }

  // Priority channels first, then alphabetical
  const items = Array.from(byTitle.values()).sort((a, b) => {
    const pa = priorityRank(a.title);
    const pb = priorityRank(b.title);
    if (pa !== pb) return pa - pb;
    return String(a.title).localeCompare(String(b.title));
  });

  if (items.length > 0) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch {}
  }
  return items;
}

function refreshInBackground(currentItems) {
  fetchAndBuildChannels(currentItems)
    .then(fresh => {
      if (fresh && fresh.length >= currentItems.length) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: fresh })); } catch {}
      }
    })
    .catch(() => {});
}

export async function getIPTVChannels() {
  const cached = readCache();
  if (cached && cached.length > 0) {
    refreshInBackground(cached);
    return cached;
  }
  return await fetchAndBuildChannels([]);
}

export async function getJioTVServerChannels(serverHost) {
  const host = String(serverHost || localStorage.getItem(JIOTV_KEY) || '').trim().replace(/\/$/, '');
  if (!host || !isSafeHttpUrl(host)) return [];
  // Only allow private-network hosts: localhost, 127.0.0.1, or RFC1918 ranges.
  try {
    const u = new URL(host);
    const h = u.hostname.toLowerCase();
    const allowed =
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h);
    if (!allowed) return [];
  } catch {
    return [];
  }
  try { return parseM3U(await fetchText(host + '/playlist.m3u')).map(normalizeChannelItem).filter(Boolean); } catch { return []; }
}
export function saveIPTVConfig({ customM3uUrl, jioTvHost }) { if (customM3uUrl !== undefined) localStorage.setItem(CUSTOM_KEY, customM3uUrl || ''); if (jioTvHost !== undefined) localStorage.setItem(JIOTV_KEY, jioTvHost || ''); localStorage.removeItem(CACHE_KEY); }
export function getIPTVConfig() { return { customM3uUrl: localStorage.getItem(CUSTOM_KEY) || '', jioTvHost: localStorage.getItem(JIOTV_KEY) || '' }; }
