/**
 * Stremio Addon Protocol for AJO
 *
 * Users paste an addon manifest URL (Settings) → catalogs, detail, and
 * streams flow into the app. Pure HTTP/JSON — no native code needed.
 *
 * Protocol (community standard):
 *   {base}/manifest.json            → addon descriptor
 *   {base}/catalog/{type}/{id}.json → list of metas
 *   {base}/meta/{type}/{id}.json    → single meta detail
 *   {base}/stream/{type}/{imdbId}.json        → streams (movie)
 *   {base}/stream/{type}/{imdbId}:{s}:{e}.json → streams (series)
 */

const ADDONS_KEY = 'ajo_stremio_addons_v1';
const CACHE_PREFIX = 'ajo_addon_';
const CACHE_TTL = 30 * 60 * 1000;

// Well-known free addons users can add with one tap
export const FEATURED_ADDONS = [
  {
    id: 'cinemeta',
    name: 'CinemetA (Catalogs)',
    url: 'https://v3-cinemeta.strem.io/manifest.json',
    types: ['movie', 'series'],
    description: 'Official movie & series catalogs — trending, popular, by genre'
  },
  {
    id: 'opensubtitles-v3',
    name: 'OpenSubtitles v3',
    url: 'https://opensubtitles-v3.strem.io/manifest.json',
    types: ['subtitles'],
    description: 'Free subtitles for movies and shows'
  }
];

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, val) {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

export function getInstalledAddons() {
  try {
    const raw = storageGet(ADDONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function saveInstalledAddons(list) {
  storageSet(ADDONS_KEY, list);
}

/**
 * Install an addon from a manifest URL. Normalizes short forms:
 * "https://v3-cinemeta.strem.io" → appends /manifest.json
 */
export async function installAddon(manifestUrl) {
  let url = String(manifestUrl || '').trim();
  if (!url) throw new Error('Enter an addon URL');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!url.includes('manifest.json')) {
    url = url.replace(/\/$/, '') + '/manifest.json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let manifest;
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw new Error('Could not reach addon: ' + e.message);
  }
  if (!manifest || !manifest.id) throw new Error('Invalid addon manifest');

  const addon = {
    id: manifest.id,
    name: manifest.name || manifest.id,
    version: manifest.version || '',
    description: manifest.description || '',
    url: url.replace(/\/manifest\.json$/, ''),
    types: manifest.types || [],
    catalogs: (manifest.catalogs || []).map(c => ({
      type: c.type,
      id: c.id,
      name: c.name || c.id,
      extra: c.extra || {}
    })),
    installedAt: Date.now()
  };

  const list = getInstalledAddons().filter(a => a.id !== addon.id);
  list.push(addon);
  saveInstalledAddons(list);
  return addon;
}

export function removeAddon(addonId) {
  saveInstalledAddons(getInstalledAddons().filter(a => a.id !== addonId));
}

async function addonFetchJson(url) {
  const cacheKey = CACHE_PREFIX + url;
  try {
    const raw = storageGet(cacheKey);
    if (raw) {
      const { at, data } = JSON.parse(raw);
      if (Date.now() - at < CACHE_TTL) return data;
    }
  } catch {}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    try { storageSet(cacheKey, JSON.stringify({ at: Date.now(), data })); } catch {}
    return data;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Fetch all catalogs from all installed addons, merged. */
export async function getAddonCatalogs() {
  const out = [];
  for (const addon of getInstalledAddons()) {
    for (const cat of addon.catalogs || []) {
      const extraQ = cat.extra?.genre ? `&genre=${encodeURIComponent(cat.extra.genre)}` : '';
      const url = `${addon.url}/catalog/${cat.type}/${cat.id}.json${extraQ}`;
      const data = await addonFetchJson(url);
      if (data?.metas?.length) {
        out.push({
          addonId: addon.id,
          addonName: addon.name,
          type: cat.type,
          catalogId: cat.id,
          catalogName: `${addon.name} · ${cat.name}`,
          items: data.metas.map(m => normalizeAddonMeta(m, addon))
        });
      }
    }
  }
  return out;
}

function normalizeAddonMeta(m, addon) {
  return {
    id: m.imdb_id ? `addon-${m.imdb_id}` : `addon-${addon.id}-${m.id}`,
    tmdb_id: m.moviedb_id || null,
    imdb_id: m.imdb_id || (typeof m.id === 'string' && m.id.startsWith('tt') ? m.id : null),
    type: m.type === 'series' ? 'series' : 'movie',
    category: m.type === 'series' ? 'serials' : 'hollywood',
    title: m.name || m.title || 'Untitled',
    title_en: m.name || m.title || 'Untitled',
    year: m.releaseInfo ? String(m.releaseInfo).slice(0, 4) : '',
    rating: m.imdbRating || '',
    description: m.description || '',
    poster_url: m.poster || '',
    poster: m.poster || '',
    backdrop_url: m.background || m.poster || '',
    _fromAddon: addon.id
  };
}

/**
 * Get streams for a title from all installed addons.
 * Returns [{addonName, name, title, description, url, isTorrent}]
 */
export async function getAddonStreams(item) {
  const imdb = item?.imdb_id;
  if (!imdb) return [];
  const mediaType = item.type === 'series' || item.category === 'serials' ? 'series' : 'movie';
  const streams = [];

  for (const addon of getInstalledAddons()) {
    if (!(addon.types || []).includes(mediaType)) continue;
    // Only query addons that declare stream resource
    const hasStreams = (addon.manifestResources || []).includes('stream')
      || true; // most video addons serve /stream even if loosely declared
    if (!hasStreams) continue;

    let url;
    if (mediaType === 'movie') {
      url = `${addon.url}/stream/movie/${imdb}.json`;
    } else {
      const s = item.season || item.season_num || 1;
      const e = item.episode || item.episode_num || 1;
      url = `${addon.url}/stream/series/${imdb}:${s}:${e}.json`;
    }
    const data = await addonFetchJson(url);
    for (const s of data?.streams || []) {
      streams.push({
        addonName: addon.name,
        name: s.name || addon.name,
        title: s.title || s.name || 'Stream',
        description: s.description || '',
        url: s.url || null,
        infoHash: s.infoHash || null,
        ytId: s.ytId || null,
        isTorrent: Boolean(s.infoHash) && !s.url,
        source: s.url && /\.(mp4|m3u8|mkv)/i.test(s.url) ? 'video' : 'embed',
        quality: (s.name || '').match(/\d{3,4}p/i)?.[0] || ''
      });
    }
  }
  return streams.filter(s => s.url); // only direct-playable for now (torrent needs debrid)
}

/** Fetch rich meta detail (description, cast, runtime) for a title. */
export async function getAddonMeta(imdbId, mediaType) {
  if (!imdbId) return null;
  for (const addon of getInstalledAddons()) {
    if (!(addon.types || []).includes(mediaType)) continue;
    const data = await addonFetchJson(`${addon.url}/meta/${mediaType}/${imdbId}.json`);
    if (data?.meta) return data.meta;
  }
  return null;
}
