import { isFavoriteChannel } from './history.js';
import { isSafeHttpUrl } from '../utils/streamingEngines.js';


const CACHE_KEY = 'ajo_iptv_cache_v3'; // v3: curated Maharashtra catalog (invalidates old mega-cache)
const CUSTOM_KEY = 'ajo_custom_m3u_v2';
const JIOTV_KEY = 'ajo_jiotv_host_v2';
const CACHE_TTL = 30 * 60 * 1000;

// v3.9.2 CURATION: Maharashtra & Hindi Lineup (Marathi + Hindi + Sports + News).
// Excludes all other regional languages (Bangla, Telugu, Tamil, Malayalam, Kannada, Punjabi, Gujarati, etc.).
const PLAYLISTS = [
  'https://iptv-org.github.io/iptv/languages/mar.m3u',     // Marathi (~31)
  'https://iptv-org.github.io/iptv/languages/hin.m3u',     // Hindi (~336)
  'https://iptv-org.github.io/iptv/countries/in.m3u',      // India Full (contains Sony SAB, Colors HD, etc.) (~731)
  'https://iptv-org.github.io/iptv/categories/sports.m3u'  // Sports (~457)
];

// Strip anything whose NAME marks another regional language.
const EXCLUDE_TITLE_RE =
  /bangla|bengali|telugu|tamil|kannada|malayalam|malyalam|punjabi|panjabi|odia|oriya|assamese|gujarati|bhojpuri|marwari|rajasthani|nepali/i;

// Most-wanted channels float to the FRONT of the grid.
const PRIORITY_CHANNEL_RE = [
  /sony\s*(sab|pal|entertainment|tv|max|wah|pix|yay|marathi)/i,
  /sab\s*tv/i,
  /zee\s*(marathi|24\s*taas|talkies|cinema|tv|anmol|bollywood|yuva|zest)/i,
  /colors\s*(marathi|cineplex|cineplex\s*bollywood|hd|infinity)/i,
  /star\s*(pravah|pravah\s*picture|plus|gold|bharat|sports)/i,
  /abp\s*(majha|news|ganga|asmit)/i,
  /news18\s*(lokmat|marathi|india)/i,
  /tv9\s*marathi/i,
  /saam\s*tv/i,
  /jai\s*maharashtra/i,
  /fakt\s*marathi|sangeet\s*marathi|shemaroo\s*marathi|ndtv\s*marathi/i,
  /\baaj\s*tak\b|\bindia\s*today\b|ndtv|\bnews\b.*hindi/i,
  /dd\s*(sports|national|news|retro|kisan|bharati|sahyadri)/i,
  /sports18|eurosport|willow|astro\s*cricket/i,
  /dangal|shemaroo/i
];

function priorityRank(title) {
  const t = String(title || '');
  for (let i = 0; i < PRIORITY_CHANNEL_RE.length; i++) {
    if (PRIORITY_CHANNEL_RE[i].test(t)) return i;
  }
  return PRIORITY_CHANNEL_RE.length;
}

export function isBlockedChannelTitle(title) {
  return EXCLUDE_TITLE_RE.test(String(title || ''));
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
  if (EXCLUDE_TITLE_RE.test(rawTitle)) return null;
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
    players: [{ name: channel.quality ? `Server 1 (${channel.quality})` : 'Server 1 (Auto)', url: channel.url, source: 'hls', quality: channel.quality || null, headers: channel.headers || {} }]
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
