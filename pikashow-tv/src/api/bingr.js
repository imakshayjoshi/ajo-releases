// v3.14.0: bingr.one open catalog API client.
// No auth, no key — TMDB-normalized JSON. Verified live Oct 18 2026:
//   /api/trending/{movie|tv}?page=N   (500 pages)
//   /api/details/{movie|tv}/{id}?v=1
//   /api/search?q=<q>&type=<movie|tv>
//   /api/discover/{movie|tv}?<params>
//   /api/anime/trending?page=N        (AniList-sourced; id + idMal)
//   /api/anime/discover?genre=..&sort=POPULARITY_DESC&isAdult=false
//   /api/categories, /api/categories/all/{GENRES|LANGUAGES|STUDIOS}
// Their player mirrors (vidbolt/filmu/vidrift/cinezo/vidy.st) live in
// streamingEngines.js — this module is catalog/metadata only.
// Fail soft everywhere: bingr is a bonus source, never a hard dependency.

const BINGR_API = 'https://api.bingr.one/api';

function bimg(url) {
  return url && typeof url === 'string' ? url : '';
}

function normalizeBingr(item, forcedType) {
  if (!item || !item.id) return null;
  const type = forcedType || (item.type === 'tv' ? 'series' : item.type === 'movie' ? 'movie' : null);
  if (!type) return null;
  const title = item.title || item.name || '';
  if (!title) return null;
  return {
    // tmdb- id prefix is what generateUniversalServers mines for the tmdb id —
    // bingr items become playable by the existing server chain with zero glue.
    id: `tmdb-${item.id}`,
    tmdb_id: item.id,
    type,
    category: type === 'series' ? 'serials' : 'HD',
    title,
    title_en: title,
    year: String(item.year || ''),
    poster: bimg(item.poster),
    backdrop: bimg(item.backdrop || item.backdrop_original),
    rating: item.rating || null,
    overview: item.overview || '',
    genres: item.genres || [],
    source: 'bingr',
  };
}

function normalizeBingrAnime(item) {
  if (!item || !item.id) return null;
  const title = item.title || item.title_english || item.title_native || '';
  if (!title) return null;
  return {
    // bingr anime ids feed the anime embed patterns directly (same thing their
    // own watch page passes to filmu/vidbolt/etc.). Kept distinct from tmdb
    // ids — they are NOT interchangeable.
    id: `bingr-anime-${item.id}`,
    bingr_id: item.id,
    mal_id: item.idMal || null,
    type: 'series',
    anime: true,
    category: 'anime',
    title,
    title_en: title,
    year: String(item.year || ''),
    poster: bimg(item.poster),
    backdrop: bimg(item.backdrop || item.poster),
    rating: item.rating || item.score || null,
    overview: item.overview || item.synopsis || '',
    source: 'bingr-anime',
  };
}

async function bingrGet(path, timeoutMs = 6000) {
  const supportsAbort = typeof AbortController !== 'undefined';
  const controller = supportsAbort ? new AbortController() : null;
  const timer = supportsAbort ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${BINGR_API}${path}`, {
      ...(supportsAbort ? { signal: controller.signal } : {}),
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
}

export async function getBingrTrending(type = 'movie', page = 1) {
  const data = await bingrGet(`/trending/${type === 'series' ? 'tv' : 'movie'}?page=${page}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((it) => normalizeBingr(it, type === 'series' ? 'series' : 'movie')).filter(Boolean);
}

export async function getBingrDiscover(type = 'movie', params = 'sort_by=popularity.desc', page = 1) {
  const data = await bingrGet(`/discover/${type === 'series' ? 'tv' : 'movie'}?${params}&page=${page}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((it) => normalizeBingr(it, type === 'series' ? 'series' : 'movie')).filter(Boolean);
}

export async function getBingrAnime(page = 1) {
  const data = await bingrGet(`/anime/trending?page=${page}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map(normalizeBingrAnime).filter(Boolean);
}

// Deeper anime pull for the dedicated tab (3 pages ≈ 60 titles).
export async function getBingrAnimeDeep(maxPages = 3) {
  const pages = await Promise.allSettled(
    Array.from({ length: maxPages }, (_, i) => getBingrAnime(i + 1))
  );
  const seen = new Set();
  const out = [];
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue;
    for (const item of p.value) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

export async function searchBingr(query, type = 'movie') {
  if (!query) return [];
  const data = await bingrGet(`/search?q=${encodeURIComponent(query)}&type=${type === 'series' ? 'tv' : 'movie'}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((it) => normalizeBingr(it, type === 'series' ? 'series' : 'movie')).filter(Boolean);
}

export async function getBingrDetails(type, id) {
  return bingrGet(`/details/${type === 'series' ? 'tv' : 'movie'}/${id}?v=1`);
}
