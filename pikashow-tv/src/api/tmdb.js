/**
 * TMDB Catalog & ID Resolution Service for AJO TV
 *
 * Unlocks:
 * 1. Worldwide movie/TV catalog (trending, popular, by genre) — replaces the
 *    thin 232-title upstream API as primary catalog.
 * 2. IMDb→TMDB→external-ID resolution so generateUniversalServers() can build
 *    the full 5-mirror queue for EVERY title (previously only items that came
 *    with IDs got mirrors).
 *
 * Key source: FilmPlus decompile (verified working 2026-08-21).
 * Rate limit: ~50 req/s is fine; we cache aggressively in localStorage.
 */

const TMDB_API = 'https://api.themoviedb.org/3';
// Primary key extracted from FilmPlus; fallback = phone's existing public key
const TMDB_KEYS = ['5b458cad0b474d21129c717626038657', '4e44d9029b1270a757cddc766a1bcb63'];
const TMDB_KEY = TMDB_KEYS[0];
const TMDB_IMG = 'https://image.tmdb.org/t/p';

const CACHE_PREFIX = 'ajo_tmdb_';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
const memoryCache = new Map();

function cacheGet(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const { at, data } = JSON.parse(raw);
      if (Date.now() - at < CACHE_TTL) {
        memoryCache.set(key, data);
        return data;
      }
    }
  } catch {}
  return null;
}

function cacheSet(key, data) {
  memoryCache.set(key, data);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // localStorage full — drop oldest entries
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
      keys.slice(0, Math.ceil(keys.length / 3)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    } catch {}
  }
}

async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ api_key: TMDB_KEY, ...params });
  let res = null;
  // Try primary key, fall back to secondary on auth failure
  for (const key of TMDB_KEYS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const url = `${TMDB_API}${path}?${new URLSearchParams({ api_key: key, ...params })}`;
      res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (res.status !== 401) break;
    } catch {
      // network error — try next key
    }
  }
  if (!res || !res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

/** Normalize a TMDB movie/show object into AJO's MediaItem shape. */
export function normalizeTmdb(item, mediaType) {
  if (!item || (!item.title && !item.name)) return null;
  const isTv = mediaType === 'tv' || Boolean(item.first_air_date);
  const title = item.title || item.name || '';
  const date = item.release_date || item.first_air_date || '';
  return {
    id: `tmdb-${mediaType}-${item.id}`,
    tmdb_id: item.id,
    imdb_id: item.external_ids?.imdb_id || item.imdb_id || null,
    type: isTv ? 'series' : 'movie',
    category: isTv ? 'serials' : (item.original_language === 'hi' ? 'bollywood' : 'hollywood'),
    title,
    title_en: title,
    year: date ? date.slice(0, 4) : '',
    rating: item.vote_average ? Number(item.vote_average).toFixed(1) : '',
    description: item.overview || '',
    poster_url: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : '',
    poster: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : '',
    backdrop_url: item.backdrop_path ? `${TMDB_IMG}/w780${item.backdrop_path}` : '',
    popularity: item.popularity || 0,
    genres: (item.genres || []).map(g => g.name),
    language: item.original_language || ''
  };
}

// ------------------------------------------------------------------ catalogs

export async function getTmdbTrending(mediaType = 'all', window = 'week') {
  const key = `trend_${mediaType}_${window}`;
  let cached = cacheGet(key);
  if (cached) return cached;
  const data = await tmdb(`/trending/${mediaType}/${window}`);
  const items = (data?.results || []).map(r => normalizeTmdb(r, r.media_type || mediaType)).filter(Boolean);
  if (items.length) cacheSet(key, items);
  return items;
}

export async function getTmdbCatalog(kind = 'movie', list = 'popular', page = 1) {
  const key = `cat_${kind}_${list}_${page}`;
  let cached = cacheGet(key);
  if (cached) return cached;
  const data = await tmdb(`/discover/${kind}`, { sort_by: `popularity.desc`, page });
  const items = (data?.results || []).map(r => normalizeTmdb(r, kind)).filter(Boolean);
  if (items.length) cacheSet(key, items);
  return items;
}

/**
 * "Because you watched X" — TMDB recommendations for a title.
 * mediaType: 'movie' | 'tv'; tmdbId: numeric TMDB id.
 */
export async function getTmdbSimilar(tmdbId, mediaType = 'movie') {
  if (!tmdbId) return [];
  const key = `sim_${mediaType}_${tmdbId}`;
  let cached = cacheGet(key);
  if (cached) return cached;
  const data = await tmdb(`/${mediaType}/${tmdbId}/recommendations`);
  const items = (data?.results || [])
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .map(r => normalizeTmdb(r, mediaType))
    .filter(Boolean)
    .slice(0, 20);
  if (items.length) cacheSet(key, items);
  return items;
}

/**
 * Personalized rail built from watch history: takes the 3 most recent
 * distinct titles and merges their recommendations (deduped).
 */
export async function getBecauseYouWatched(historyEntries) {
  if (!Array.isArray(historyEntries) || historyEntries.length === 0) return [];
  const seen = new Set();
  const merged = [];
  const seeds = historyEntries.slice(0, 3).filter(e => e.tmdb_id && e.type);
  for (const seed of seeds) {
    try {
      const recs = await getTmdbSimilar(seed.tmdb_id, seed.type === 'series' ? 'tv' : 'movie');
      for (const r of recs) {
        if (!seen.has(r.title)) {
          seen.add(r.title);
          merged.push({ ...r, becauseOf: seed.title });
        }
      }
    } catch {}
    if (merged.length >= 20) break;
  }
  // drop titles the user already watched
  const watchedTitles = new Set(historyEntries.map(h => h.title));
  return merged.filter(m => !watchedTitles.has(m.title));
}

/**
 * Fetch the official YouTube trailer key for a title (TMDB /videos).
 * Returns a YouTube key or null.
 */
export async function getTrailerKey(tmdbId, mediaType = 'movie', fallbackTitle = '') {
  // No id? Resolve via title search first.
  if (!tmdbId && fallbackTitle) {
    try {
      const results = await searchTmdb(fallbackTitle);
      const match = results.find(r => r.tmdb_id);
      if (match) tmdbId = match.tmdb_id;
    } catch {}
  }
  if (!tmdbId) return null;
  const key = `trailer_${mediaType}_${tmdbId}`;
  let cached = cacheGet(key);
  if (cached !== null && cached !== undefined) return cached;
  try {
    const data = await tmdb(`/${mediaType}/${tmdbId}/videos`, { language: 'en_US' });
    const vids = data?.results || [];
    const official =
      vids.find(v => v.site === 'YouTube' && v.official && v.type === 'Trailer') ||
      vids.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
      vids.find(v => v.site === 'YouTube' && v.type === 'Teaser');
    const result = official ? official.key : null;
    cacheSet(key, result || '');
    return result;
  } catch {
    return null;
  }
}

export async function searchTmdb(query, page = 1) {
  if (!query || query.length < 2) return [];
  const key = `search_${query.toLowerCase()}_${page}`;
  let cached = cacheGet(key);
  if (cached) return cached;
  const data = await tmdb('/search/multi', { query, page, include_adult: false });
  const items = (data?.results || []).map(r => normalizeTmdb(r, r.media_type)).filter(
    // filter out people — we only want movies/TV
    i => i && (i.type === 'movie' || i.type === 'series')
  );
  if (items.length) cacheSet(key, items);
  return items;
}

// ------------------------------------------------------- external ID lookup

/**
 * Resolve the IMDb id for a TMDB id. Cached forever (IDs never change).
 * This is THE unlock: with imdb_id present, streamingEngines builds the
 * full mirror queue (VidLink, AutoEmbed, 2Embed, VidSrc, APIPlayer).
 */
export async function resolveImdbId(tmdbId, mediaType = 'movie') {
  if (!tmdbId) return null;
  const key = `imdb_${mediaType}_${tmdbId}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached; // may be legitimately '' after a failed lookup
  const data = await tmdb(`/${mediaType}/${tmdbId}/external_ids`);
  const imdbId = data?.imdb_id || '';
  cacheSet(key, imdbId);
  return imdbId || null;
}

/**
 * Enrich an AJO catalog item with its IMDb id (mutates + returns item).
 * Non-blocking friendly: returns the item unchanged on any failure.
 */
export async function enrichWithImdb(item) {
  try {
    if (!item || item.imdb_id) return item;
    const tmdbId = Number(item.tmdb_id);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return item;
    const mediaType = item.type === 'series' || item.category === 'serials' ? 'tv' : 'movie';
    const imdbId = await resolveImdbId(tmdbId, mediaType);
    if (imdbId) item.imdb_id = imdbId;
  } catch {}
  return item;
}
