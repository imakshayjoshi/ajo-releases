/**
 * Movibox source integration — v3.12.62.
 *
 * movibox.xyz (MovieBox family) serves its whole catalog through the
 * wefeed-h5api BFF and plays DIRECT MP4s from a CDN — no embeds, no ads, no
 * Cloudflare. That makes it the highest-quality source in the app when
 * alive: a 1080p MP4 every player can decode.
 *
 * Because the BFF sends no CORS headers, everything routes through our VPS
 * (ajo_movibox.py on 72.60.220.246, new.ajo.co.in/movibox/):
 *   GET /catalog.json        merged deduped catalog (~every title they have)
 *   GET /play?subjectId&se&ep&detailPath  -> fresh signed MP4 URLs (360..1080)
 *      (signatures are per-request — resolve at PLAY time, never cache)
 *
 * Item shape maps onto the app MediaItem contract; items carry moviboxId so
 * handleStartPlayback can inject the direct streams as the FIRST servers
 * (before the embed mirrors).
 */

// v3.17.31: native bridge — no VPS proxy. Calls api.inmoviebox.com directly
// from Android via MoviboxApi JavaScript interface (bypasses CORS).
const CATALOG_URL = ''; // VPS removed — use native bridge
const PLAY_URL = ''; // VPS removed — use native bridge

function hasMoviboxBridge() {
  return typeof window !== 'undefined' && window.MoviboxApi && typeof window.MoviboxApi.moviboxGet === 'function';
}

function moviboxNativeGet(path, params) {
  if (!hasMoviboxBridge()) return null;
  try {
    const result = window.MoviboxApi.moviboxGet(path, params || '');
    if (!result) return null;
    const parsed = JSON.parse(result);
    if (parsed && parsed.error) return null;
    return parsed;
  } catch {
    return null;
  }
}
const CACHE_KEY = 'ajo_movibox_catalog_v1';
const CACHE_TTL = 30 * 60 * 1000; // 30 min

let memoryCatalog = null;

async function fetchJson(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Load the movibox catalog (memory -> localStorage -> network). */
export async function getMoviboxCatalog() {
  if (memoryCatalog && Date.now() - memoryCatalog._loadedAt < CACHE_TTL) {
    return memoryCatalog.items || [];
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - parsed._loadedAt < CACHE_TTL) {
        memoryCatalog = parsed;
        return parsed.items || [];
      }
    }
  } catch {}
  // v3.17.31: use native bridge to fetch home/catalog from movibox API
  if (hasMoviboxBridge()) {
    try {
      // Try home operating endpoint for trending/popular
      const data = moviboxNativeGet('/home/operating', '');
      if (data && data.data && Array.isArray(data.data)) {
        const items = data.data.filter(i => i && i.subjectId).map(i => ({
          moviboxId: String(i.subjectId),
          title: i.title || i.name || '',
          poster: i.cover || i.poster || '',
          type: i.type === 'tv' ? 'series' : 'movie',
          year: i.year || '',
          genre: i.genre || '',
        }));
        const wrapped = { _loadedAt: Date.now(), items };
        memoryCatalog = wrapped;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(wrapped)); } catch {}
        return items;
      }
    } catch {}
  }
  return [];
}

/** Map a movibox item into the app's MediaItem shape. */
export function normalizeMovibox(raw) {
  if (!raw || !raw.moviboxId || !raw.title) return null;
  const isSeries = raw.type === 'series';
  return {
    id: `movibox-${raw.moviboxId}`,
    moviboxId: String(raw.moviboxId),
    detailPath: raw.detailPath || '',
    type: isSeries ? 'series' : 'movie',
    category: isSeries ? 'serials' : 'hollywood',
    title: raw.title,
    title_en: raw.title,
    year: raw.year || '',
    rating: raw.rating && raw.rating !== '0' ? raw.rating : '',
    description: raw.description || '',
    poster_url: raw.poster || '',
    poster: raw.poster || '',
    backdrop_url: raw.poster || '',
    genres: String(raw.genre || '').split(',').map((g) => g.trim()).filter(Boolean),
    country: raw.country || '',
    source: 'movibox',
  };
}

/**
 * v3.12.73 (movies/series fix): the movibox CDN (bcdnx.hakunaymatata.com)
 * hotlink-gates — 429 for every request without browser UA + movibox
 * Referer. The native ExoPlayer path now sends those headers itself
 * (PlayerActivity buildDataSourceFactory). But the WebView <video> element
 * (phone / web fallback / non-native devices) cannot send custom headers,
 * so raw CDN URLs die there too. Route those through the VPS range proxy
 * (/movibox/stream — same server that signs the play URLs).
 */
const STREAM_PROXY = 'https://new.ajo.co.in/movibox/stream?url=';
const DIRECT_CDN_HOSTS = /hakunaymatata\.com|aoneroom\.com|macdn\.com/i;

/**
 * Resolve fresh signed stream URLs for a movibox title.
 * Returns [{resolution, url, format}] sorted best-first, or [].
 * On devices WITHOUT the native bridge the URLs come back proxied so the
 * <video> element can actually stream them.
 */
export async function getMoviboxStreams(item, episodeInfo = null) {
  if (!PLAY_URL) return []; // v3.17.51: no play endpoint configured
  try {
    const mid = item?.moviboxId || (String(item?.id || '').startsWith('movibox-')
      ? String(item.id).slice('movibox-'.length) : null);
    if (!mid) return [];
    const se = episodeInfo?.season_number || episodeInfo?.season || 0;
    const ep = episodeInfo?.episode_number || episodeInfo?.episode || 0;
    // v3.17.31: native bridge — no VPS proxy, no CORS issues
    if (hasMoviboxBridge() && window.MoviboxApi.moviboxPlayInfo) {
      const result = window.MoviboxApi.moviboxPlayInfo(String(mid), se, ep);
      if (result) {
        const data = JSON.parse(result);
        if (data && !data.error) {
          // Play-info returns streams array
          const streams = data.streams || data.data?.streams || data.data || [];
          if (Array.isArray(streams) && streams.length > 0) {
            return streams
              .filter(s => s.url && !s.vipLocked)
              .sort((a, b) => Number(b.resolution || 0) - Number(a.resolution || 0))
              .map(s => ({
                resolution: s.resolution || 1080,
                url: s.url,
                format: s.format || 'mp4',
                vipLocked: false,
              }));
          }
        }
      }
    }
    // Fallback to fetchJson if bridge fails (web dev mode)
    const q = new URLSearchParams({ subjectId: mid, se: String(se), ep: String(ep) });
    const data = await fetchJson(`${PLAY_URL}?${q.toString()}`, 12000);
    if (!data || !Array.isArray(data.streams)) return [];
    return data.streams.filter(s => s.url && !s.vipLocked);
  } catch {
    return [];
  }
}

/** Search the movibox catalog client-side (title + genre contains). */
export async function searchMovibox(query) {
  const clean = String(query || '').trim();
  if (!clean) return [];
  // v3.17.31: native API search (server-side)
  if (hasMoviboxBridge() && window.MoviboxApi.moviboxSearch) {
    try {
      const result = window.MoviboxApi.moviboxSearch(clean);
      if (result) {
        const data = JSON.parse(result);
        if (data && !data.error) {
          const results = data.data || data.results || data || [];
          if (Array.isArray(results)) {
            return results
              .filter(i => i && i.subjectId)
              .map(i => normalizeMovibox({
                moviboxId: String(i.subjectId),
                title: i.title || i.name || '',
                poster: i.cover || i.poster || '',
                type: i.type === 'tv' ? 'series' : 'movie',
                year: i.year || '',
                genre: i.genre || '',
              }))
              .filter(Boolean);
          }
        }
      }
    } catch {}
  }
  // Fallback to client-side catalog search
  const items = await getMoviboxCatalog();
  return items
    .filter((i) => `${i.title} ${i.genre}`.toLowerCase().includes(clean.toLowerCase()))
    .map(normalizeMovibox)
    .filter(Boolean);
}
