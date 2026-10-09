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

const CATALOG_URL = 'https://new.ajo.co.in/movibox/catalog.json';
const PLAY_URL = 'https://new.ajo.co.in/movibox/play';
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
  const data = await fetchJson(CATALOG_URL, 15000);
  if (data && Array.isArray(data.items)) {
    const wrapped = { _loadedAt: Date.now(), items: data.items };
    memoryCatalog = wrapped;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(wrapped)); } catch {}
    return data.items;
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
export function moviboxProxyUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (DIRECT_CDN_HOSTS.test(url)) return STREAM_PROXY + encodeURIComponent(url);
  return url;
}
export function hasNativePlayerBridge() {
  try {
    return typeof window !== 'undefined'
      && window.AndroidNativePlayer
      && typeof window.AndroidNativePlayer.playStream === 'function';
  } catch {
    return false;
  }
}

/**
 * Resolve fresh signed stream URLs for a movibox title.
 * Returns [{resolution, url, format}] sorted best-first, or [].
 * On devices WITHOUT the native bridge the URLs come back proxied so the
 * <video> element can actually stream them.
 */
export async function getMoviboxStreams(item, episodeInfo = null) {
  try {
    const mid = item?.moviboxId || (String(item?.id || '').startsWith('movibox-')
      ? String(item.id).slice('movibox-'.length) : null);
    if (!mid) return [];
    const se = episodeInfo?.season_number || episodeInfo?.season || 0;
    const ep = episodeInfo?.episode_number || episodeInfo?.episode || 0;
    const q = new URLSearchParams({ subjectId: mid, se: String(se), ep: String(ep) });
    if (item.detailPath) q.set('detailPath', item.detailPath);
    const data = await fetchJson(`${PLAY_URL}?${q.toString()}`, 12000);
    if (!data || !Array.isArray(data.streams)) return [];
    const useProxy = !hasNativePlayerBridge();
    return data.streams
      .filter((s) => s.url && !s.vipLocked)
      .sort((a, b) => Number(b.resolution || 0) - Number(a.resolution || 0))
      .map((s) => (useProxy ? { ...s, url: moviboxProxyUrl(s.url) } : s));
  } catch {
    return [];
  }
}

/** Search the movibox catalog client-side (title + genre contains). */
export async function searchMovibox(query) {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean) return [];
  const items = await getMoviboxCatalog();
  return items
    .filter((i) => `${i.title} ${i.genre}`.toLowerCase().includes(clean))
    .map(normalizeMovibox)
    .filter(Boolean);
}
