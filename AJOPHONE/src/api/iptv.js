import { isFavoriteChannel } from './history.js';
import { isSafeHttpUrl } from '../utils/streamingEngines.js';

// v3.9.1: bumped from v6 to v7 — old cache entries used a different dedup key
// (title.replace(/[^a-z0-9]/g,'')) that kept HD/SD duplicates. Bump forces a
// full refresh so the new normalizeTitleKey logic takes effect immediately.
const CACHE_KEY = 'ajo_iptv_cache_v8';
const CUSTOM_KEY = 'ajo_custom_m3u_v2';
const JIOTV_KEY = 'ajo_jiotv_host_v2';
const CACHE_TTL = 30 * 60 * 1000;

// All Indian & global sports/entertainment playlists
// v3.12.0: curated for Marathi / Hindi / English viewers — regional languages
// (tel/tam/kan/mal/ben/pan/guj) removed. Server-side liveness probe filters
// dead streams; see https://new.ajo.co.in/channels/channels.json
const PLAYLISTS = [
  'https://iptv-org.github.io/iptv/countries/in.m3u',              // India (~750)
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u', // India direct mirrors
  'https://iptv-org.github.io/iptv/languages/hin.m3u',             // Hindi (~336)
  'https://iptv-org.github.io/iptv/languages/mar.m3u',             // Marathi (~31)
  'https://iptv-org.github.io/iptv/languages/eng.m3u',             // English (~700)
  'https://iptv-org.github.io/iptv/categories/sports.m3u',          // Sports
  'https://iptv-org.github.io/iptv/categories/news.m3u',            // News
  'https://iptv-org.github.io/iptv/categories/movies.m3u',          // Movies
  'https://iptv-org.github.io/iptv/categories/music.m3u',           // Music
  'https://iptv-org.github.io/iptv/categories/entertainment.m3u'    // Entertainment
];

// Language allow-list for viewers who want Marathi / Hindi / English only.
const KEEP_LANG = new Set(['hindi', 'marathi', 'english', '', 'hindi-roman', 'hindi-english', 'english-hindi']);
const MANIFEST_URL = 'https://new.ajo.co.in/channels/channels.json';
const MANIFEST_CACHE_KEY = 'ajo_channels_manifest_v1';
const MANIFEST_TTL = 12 * 60 * 60 * 1000;

// v3.12.0: curated logos for popular channels whose playlist entry has none
// (URLs verified live 2026-08-25 from jiotvimages / xstreamcp / tmsimg CDNs).
const LOGO_OVERRIDES = {
  '9xm': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_9XM/images/LOGO_HD/image.png',
  'aajtak': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_AAJ_TAK/images/LOGO_HD/image.png',
  'abpmajha': 'https://dtil.tmsimg.com/assets/s142521_ld_h15_aa.png?lock=720x540',
  'abpnews': 'https://dtil.tmsimg.com/assets/s158138_ld_h15_aa.png?lock=720x540',
  'b4umusic': 'https://i.imgur.com/NwOQUDp.png',
  'b4umovies': 'https://i.imgur.com/NwOQUDp.png',
  'colorsmarathi': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_COLORS_MARATHI/images/LOGO_HD/image.png',
  'ddnational': 'https://ltsk-cdn.s3.eu-west-1.amazonaws.com/jumpstart/Temp_Live/cdn/HLS/Channel/transparentImages/DD%20National.png',
  'ddnews': 'https://ltsk-cdn.s3.eu-west-1.amazonaws.com/jumpstart/Temp_Live/cdn/HLS/Channel/transparentImages/DD%20News%20HD.png',
  'ddsports': 'https://dtil.tmsimg.com/assets/s158255_ld_h15_aa.png?lock=720x540',
  'faktmarathi': 'https://dtil.tmsimg.com/assets/s143038_ld_h15_aa.png?lock=720x540',
  'indiatv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_INDIA_TV/images/LOGO_HD/image.png',
  'mtv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_MTV/images/LOGO_HD/image.png',
  'ndtv247': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_NDTV_24X7/images/LOGO_HD/image.png',
  'ndtv24x7': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_NDTV_24X7/images/LOGO_HD/image.png',
  'ndtvindia': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_NDTV_INDIA/images/LOGO_HD/image.png',
  'saamtv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SAAM_TV/images/LOGO_HD/image.png',
  'shemaroomovies': 'https://jiotvimages.cdn.jio.com/dare_images/images/channel/0d5b07555b2d4415aa9f145273095ed7.png',
  'shemarootv': 'https://jiotvimages.cdn.jio.com/dare_images/images/channel/0d5b07555b2d4415aa9f145273095ed7.png',
  'sonymax': 'https://dtil.tmsimg.com/assets/s179440_ld_h15_aa.png?lock=720x540',
  'sonymaxhd': 'https://dtil.tmsimg.com/assets/s179440_ld_h15_aa.png?lock=720x540',
  'starbharat': 'https://i.imgur.com/Q8ajPij.png',
  'starpravah': 'https://i.imgur.com/ZT0u7AK.png',
  'starsports1hindi': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_STAR_SPORTS_1_HINDI/images/LOGO_HD/image.png',
  'starsports1': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_STAR_SPORTS_1_HINDI/images/LOGO_HD/image.png',
  'starsports2': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_STAR_SPORTS_2/images/LOGO_HD/image.png',
  'starutsav': 'https://i.imgur.com/k5QHfH2.png',
  'timesnow': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_TIMES_NOW/images/LOGO_HD/image.png',
  'zee247aas': 'https://dtil.tmsimg.com/assets/GNLZZGG00230LKE.png?lock=720x540',
  'zee24taas': 'https://dtil.tmsimg.com/assets/GNLZZGG00230LKE.png?lock=720x540',
  'zeeaction': 'https://dtil.tmsimg.com/assets/GNLZZGG0022K5ZV.png?lock=720x540',
  'zeecinema': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_ZEE_CINEMA/images/LOGO_HD/LOGO_HD_image.png',
  'zeemarathi': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_ZEE_MARATHI/images/LOGO_HD/LOGO_HD_image.png',
  'zeenews': 'https://dtil.tmsimg.com/assets/GNLZZGG0023VWYC.png?lock=720x540',
  'andtv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SYMANDTV/images/LOGO_HD/LOGO_HD_image.png',
  'histv18': 'https://dtil.tmsimg.com/assets/s143132_ld_h15_aa.png?lock=720x540',
  'stargold': 'https://i.imgur.com/G0ZfZZr.png',
  'sonywah': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_WAH/images/LOGO_HD/image.png',
  'cnbcawaaz': 'https://jiotvimages.cdn.jio.com/dare_images/images/CNBCAwaaz.png',
  'manoranjan': 'https://dtil.tmsimg.com/assets/s143302_ld_h15_aa.png?lock=720x540'
};

// v3.12.0: all legacy premium mirror hosts died (38.96.178.205, pishow.tv, aynascope,
// 103.72.101.252, 41.205.93.154, 103.159.180.34, 103.253.18.58 — verified 2026-08-25).
// Live channels now come from the server-side validated manifest (channel liveness probe).
const BUILTIN_INDIAN_CHANNELS = [];

const POPULAR_PATTERNS = [
  'star sports 1', 'star sports 2', 'star sports select', 'star sports 3', 'star sports hindi',
  'sports18', 'dd sports', 'ten 1', 'ten 2', 'willow', 'espn', 'sky sports', 'eurosport',
  'star plus', 'star bharat', 'star utsav', 'star gold', 'star pravah', 'star movi',
  'colors', 'colors marathi', 'zee tv', 'zeetv', 'zee marathi', 'zee 24', 'zee news',
  'zee cinema', 'zee talkies', 'zee action', 'sony sab', 'sony max', 'sony pal', 'sony wah',
  'sony sports', 'sony ten', 'sony tv', 'sony marathi', 'shemaroo', '&tv', 'andtv', 'mtv',
  'b4u', '9xm', 'suno', 'manoranjan', 'enterr10', 'mahuaa', 'aaj tak', 'india tv',
  'times now', 'republic', 'ndtv', 'abp', 'abb tak', 'news18', 'tv9', 'wion',
  'fakt marathi', 'saam tv', 'mkn', 'sangeet', 'chitramala', 'shubh', 'etv marathi',
  'dd national', 'dd news', 'dd marathi', 'muzy', 'mirror now', 'cnbc', 'cnn', 'bbc'
];
function priorityRank(title) {
  const n = String(title || '').toLowerCase();
  let score = 0;
  for (const p of POPULAR_PATTERNS) {
    if (n.includes(p)) score += 1;
  }
  return -score;
}

/**
 * Shared channel-title normalizer: strips trailing quality suffixes
 * (HD/SD/FHD/UHD/4K) and non-alphanumerics so "Sony SAB HD" and
 * "Sony SAB" collapse to the same key. Kept in ONE place (exported)
 * so iptv.js / pikashow.js / sports.js can never drift apart.
 * v3.10.0: removed the bare trailing-2 strip which merged distinct
 * channels like "Star Sports 2" into "Star Sports".
 */
export function normalizeChannelKey(t) {
  return String(t || '').trim().toLowerCase()
    .replace(/[\s._()\-]+(?:hd|sd|fhd|uhd|4k|sd1|hd1)$/i, '')
    .replace(/[^a-z0-9]/g, '');
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

  const logoOverride = LOGO_OVERRIDES[normalizeChannelKey(displayTitle)] || '';
  const resolvedPoster = channel.poster || channel.poster_url || logoOverride || '';

  const item = {
    id: channel.id || `channel-${index + 1}`,
    title: displayTitle,
    title_en: displayTitle,
    category: channel.category || 'Live TV',
    poster: resolvedPoster,
    poster_url: resolvedPoster,
    latencyMs: typeof channel.ms === 'number' ? channel.ms : null,
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
      pending = {
        id: attr('tvg-id'),
        poster: attr('tvg-logo'),
        category: attr('group-title') || 'Live TV',
        lang: attr('tvg-language').toLowerCase(),
        title: line.slice(line.lastIndexOf(',') + 1).trim()
      };
    } else if (pending && /^https?:\/\//i.test(line)) {
      pending.url = line;
      channels.push(pending);
      pending = null;
    }
  }
  return channels;
}

// v3.12.0: server-validated channel manifest — every URL passed a liveness
// probe (HTTP 200 + media payload), so no more dead tiles in the grid.
const MANIFEST_PREFIX = MANIFEST_URL.slice(0, MANIFEST_URL.lastIndexOf('/') + 1);

function readManifestCache() {
  try {
    const value = JSON.parse(localStorage.getItem(MANIFEST_CACHE_KEY) || 'null');
    return value && Date.now() - value.savedAt < MANIFEST_TTL && Array.isArray(value.channels) ? value.channels : null;
  } catch { return null; }
}

async function fetchManifestChannels() {
  const cached = readManifestCache();
  if (cached && cached.length > 0) return cached;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(MANIFEST_URL, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const channels = Array.isArray(data?.channels) ? data.channels : [];
    if (channels.length > 0) {
      try { localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), channels })); } catch {}
    }
    return channels;
  } catch {
    return cached || [];
  } finally {
    clearTimeout(timer);
  }
}

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return value && Date.now() - value.savedAt < CACHE_TTL && Array.isArray(value.items) ? value.items : null;
  } catch { return null; }
}

async function fetchAndBuildChannels(previousItems) {
  // v3.12.0: prefer the server-validated manifest (dead channels already removed).
  const manifest = await fetchManifestChannels();
  if (manifest.length > 0) {
    const items = buildFromManifest(manifest);
    if (items.length > 0) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch {}
      return items;
    }
  }

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

  // v3.10.0: shared exported normalizer (used by pikashow.js + sports.js too)
  const normalizeTitleKey = (t) => normalizeChannelKey(t);


  // First seed with built-in high-priority Indian channels
  for (const builtin of BUILTIN_INDIAN_CHANNELS) {
    const normalized = normalizeChannelItem(builtin, byTitle.size);
    if (normalized) {
      const titleKey = normalizeTitleKey(normalized.title);
      if (titleKey) byTitle.set(titleKey, normalized);
    }
  }

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const channel of parseM3U(result.value)) {
      // v3.12.0: Marathi / Hindi / English only (fallback path, no manifest).
      if (channel.lang && !KEEP_LANG.has(channel.lang)) continue;
      const normalized = normalizeChannelItem(channel, byTitle.size);
      if (!normalized) continue;
      const titleKey = normalizeTitleKey(normalized.title);
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
    const titleKey = normalizeTitleKey(String(prev?.title || ''));
    if (!titleKey || byTitle.has(titleKey)) continue;
    byTitle.set(titleKey, prev);
  }

  // Priority channels first, then fastest (latency) for manifest items, else alphabetical
  const items = Array.from(byTitle.values()).sort((a, b) => {
    const pa = priorityRank(a.title);
    const pb = priorityRank(b.title);
    if (pa !== pb) return pa - pb;
    if (typeof a.latencyMs === 'number' && typeof b.latencyMs === 'number') return a.latencyMs - b.latencyMs;
    return String(a.title).localeCompare(String(b.title));
  });

  if (items.length > 0) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch {}
  }
  return items;
}

function buildFromManifest(manifest) {
  const byTitle = new Map();
  for (let i = 0; i < manifest.length; i++) {
    const m = manifest[i];
    if (!m?.u || !isSafeHttpUrl(m.u)) continue;
    const normalized = normalizeChannelItem({
      id: 'm-' + i, title: m.n, poster: m.l, category: m.c || 'Live TV', url: m.u, ms: m.ms, players: [{
        name: 'Server 1 (Verified)', url: m.u, source: 'hls', quality: 'HD', headers: {}
      }]
    }, i);
    if (!normalized) continue;
    const key = normalizeChannelKey(normalized.title);
    if (!key || byTitle.has(key)) continue;
    byTitle.set(key, normalized);
  }
  // v3.12.0: keep the server's curated order (popularity + latency) — dedupe only.
  return Array.from(byTitle.values());
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
