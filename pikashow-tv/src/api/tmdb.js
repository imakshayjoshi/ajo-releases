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

const TMDB_API = (() => {
  // v3.12.62: the Fire TV stick's DNS/route to api.themoviedb.org is broken
  // (curl 000s; every other CDN works), which silently gutted the catalog to
  // the thin local list. Route TMDB through our VPS proxy on the same origin
  // that already serves health.json + channels (traefik -> ajo-tmdb :3005,
  // IPv6-first with retry — see /root/ajo-tmdb-proxy.py on 72.60.220.246).
  // A global switch lets tests or a fixed-stick future flip it back.
  try {
    if (typeof window !== 'undefined' && window.__AJO_USE_DIRECT_TMDB) {
      return 'https://api.themoviedb.org/3';
    }
  } catch {}
  return 'https://new.ajo.co.in/tmdb';
})();
const TMDB_IMG = (() => {
  try {
    if (typeof window !== 'undefined' && window.__AJO_USE_DIRECT_TMDB) {
      return 'https://image.tmdb.org/t/p';
    }
  } catch {}
  // posters through the same proxy (traefik /tmdbimg -> :3005 -> image.tmdb.org)
  return 'https://new.ajo.co.in/tmdbimg/t/p';
})();
// Primary key extracted from FilmPlus; fallback = phone's existing public key
const TMDB_KEYS = ['5b458cad0b474d21129c717626038657', '4e44d9029b1270a757cddc766a1bcb63'];
const TMDB_KEY = TMDB_KEYS[0];

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

/** v3.11.0: recently released movies (TMDB now_playing) for the New Releases rail. */
export async function getTmdbNowPlaying(limit = 20) {
  try {
    const data = await tmdb('/movie/now_playing', { region: 'IN', language: 'en-US' });
    const list = Array.isArray(data?.results) ? data.results.slice(0, limit) : [];
    return list.map(r => normalizeTmdb(r, 'movie')).filter(Boolean);
  } catch {
    return [];
  }
}

/** Fetch trending and new Indian/Bollywood & OTT releases (e.g. Zee5, Netflix, Prime) */
export async function getTmdbIndianMovies(page = 1) {
  const key = `indian_movies_${page}`;
  let cached = cacheGet(key);
  if (cached) return cached;
  const data = await tmdb('/discover/movie', {
    with_original_language: 'hi',
    sort_by: 'popularity.desc',
    page
  });
  const items = (data?.results || []).map(r => normalizeTmdb(r, 'movie')).filter(Boolean);
  if (items.length) cacheSet(key, items);
  return items;
}

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
 * v3.12.65: deep catalog loader. getTmdbCatalog() returns ONE page (20
 * titles), so the Movies/Series tabs were stuck at "a few" even though TMDB
 * has the full library behind page 2..N. This walks `maxPages` pages in
 * batches and calls onPage after every batch so the grid fills progressively
 * instead of waiting for every request.
 */
export async function getTmdbCatalogDeep(kind = 'movie', maxPages = 30, onPage = null) {
  const all = [];
  const BATCH = 5;
  for (let start = 1; start <= maxPages; start += BATCH) {
    const pages = [];
    for (let page = start; page < Math.min(start + BATCH, maxPages + 1); page += 1) pages.push(page);
    const groups = await Promise.allSettled(
      pages.map((page) => getTmdbCatalog(kind, 'popular', page))
    );
    for (const group of groups) {
      if (group.status === 'fulfilled' && Array.isArray(group.value)) all.push(...group.value);
    }
    if (onPage) {
      try { onPage(all.slice()); } catch {}
    }
  }
  return all;
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

/** Fetch episodes for a TMDB TV series */
export async function getTmdbEpisodes(tmdbId, season = 1) {
  if (!tmdbId) return [];
  const key = `episodes_${tmdbId}_${season}`;
  let cached = cacheGet(key);
  if (cached) return cached;
  const data = await tmdb(`/tv/${tmdbId}/season/${season}`);
  const rawEps = Array.isArray(data?.episodes) ? data.episodes : [];
  const items = rawEps.map(ep => ({
    id: `tmdb-ep-${tmdbId}-${season}-${ep.episode_number}`,
    episode_number: ep.episode_number,
    season_number: season,
    name: ep.name || `Episode ${ep.episode_number}`,
    title: ep.name || `Episode ${ep.episode_number}`,
    overview: ep.overview || '',
    air_date: ep.air_date || '',
    runtime: ep.runtime ? `${ep.runtime} min` : '45 min',
    still_path: ep.still_path ? `${TMDB_IMG}/w300${ep.still_path}` : '',
    poster: ep.still_path ? `${TMDB_IMG}/w300${ep.still_path}` : '',
    poster_url: ep.still_path ? `${TMDB_IMG}/w300${ep.still_path}` : '',
    tmdb_id: tmdbId
  }));
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
 * Search TMDB for an exact title match (e.g. for PikaShow/upstream catalog items).
 */
export async function searchExactMedia(title, type = 'movie', year = null) {
  if (!title) return null;
  const cleanTitle = String(title).trim();
  const endpoint = type === 'series' || type === 'tv' ? '/search/tv' : '/search/movie';
  const params = { query: cleanTitle };
  if (year && /^\d{4}$/.test(String(year))) {
    if (type === 'series' || type === 'tv') params.first_air_date_year = year;
    else params.year = year;
  }
  const data = await tmdb(endpoint, params);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length > 0) {
    return results[0].id;
  }
  // If year filtering had no results, search by title alone
  if (params.year || params.first_air_date_year) {
    const fallbackData = await tmdb(endpoint, { query: cleanTitle });
    const fallbackResults = Array.isArray(fallbackData?.results) ? fallbackData.results : [];
    if (fallbackResults.length > 0) return fallbackResults[0].id;
  }
  return null;
}

/**
 * Enrich an AJO catalog item with its IMDb id (mutates + returns item).
 * Non-blocking friendly: returns the item unchanged on any failure.
 */
export async function enrichWithImdb(item) {
  // v3.12.59: PLAY-START BUDGET. This call sits on the critical path of
  // every play. Previously two sequential TMDB round-trips (search + find)
  // with NO deadline: a slow TMDB could hold the play button for 16s+.
  // Now the whole enrichment races a 2.5s timer — losing the race returns
  // the item unchanged; the missing imdb_id just means fewer mirrors this
  // click (generateUniversalServers works from tmdb_id too, and the next
  // play attempt hits the cache).
  return Promise.race([
    enrichWithImdbInner(item),
    new Promise((resolve) => setTimeout(() => resolve(item), 2500))
  ]);
}

async function enrichWithImdbInner(item) {
  try {
    if (!item) return item;
    const isSeries = item.type === 'series'
      || item.category === 'serials'
      || item.type === 'serial'
      || item.type === 'tv'
      || Boolean(item.season_number)
      || Boolean(item.episode_number)
      || (typeof item.id === 'string' && item.id.startsWith('tmdb-ep-'));
    const mediaType = isSeries ? 'tv' : 'movie';
    let tmdbId = item.tmdb_id;
    if (!tmdbId && typeof item.id === 'string') {
      if (item.id.startsWith('tmdb-ep-')) {
        const parts = item.id.split('-');
        if (parts[2] && /^\d+$/.test(parts[2])) tmdbId = Number(parts[2]);
      } else if (item.id.startsWith('tmdb-')) {
        const parts = item.id.split('-');
        const candidate = parts[parts.length - 1];
        if (/^\d+$/.test(candidate)) tmdbId = Number(candidate);
      }
    }
    // If no verified tmdb_id, search TMDB by title!
    const searchTitle = item.series_title || (item.season_number || item.episode_number ? item.title?.split(' - S')[0] : item.title);
    if (!tmdbId && searchTitle) {
      const resolved = await searchExactMedia(searchTitle, mediaType, item.year);
      if (resolved) {
        tmdbId = resolved;
        item.tmdb_id = resolved;
      }
    }
    if (!tmdbId) return item;
    const imdbId = await resolveImdbId(tmdbId, mediaType);
    if (imdbId) item.imdb_id = imdbId;
  } catch {}
  return item;
}
