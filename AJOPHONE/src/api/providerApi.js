/**
 * Streaming Provider Catalog via TMDB Watch Providers API
 * 
 * Enables browsing content by streaming platform (Netflix, Prime, Disney+, etc.)
 * Uses TMDB's discover endpoint with watch provider filters.
 */

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEYS = ['5b458cad0b474d21129c717626038657', '4e44d9029b1270a757cddc766a1bcb63'];
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const CACHE_PREFIX = 'ajo_prov_';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4h

// v3.12.80: Akkshay reported "all OTT does not have the icons" — the old
// logo URLs were dead TMDB originals (404). Every logo below is now pulled
// from the LIVE TMDB watch-providers payload (probed 200). Providers TMDB
// doesn't expose in the Indian region (Paramount+ has no IN catalog; Ajio is
// e-commerce, not an OTT) are dropped — the UI falls back to a brand-color
// monogram chip for any logo that fails, so no tile ever renders empty.
// Provider IDs from TMDB (region: IN for India)
export const PROVIDERS = [
  {
    id: 8,
    name: 'Netflix',
    color: '#E50914',
    logo: 'https://image.tmdb.org/t/p/original/rK1KljqmbvO9HQa1PBFLILWah72.png'
  },
  {
    id: 119,
    name: 'Amazon Prime',
    color: '#00A8E1',
    logo: 'https://image.tmdb.org/t/p/original/gMZdpavHmxFNnLpMHwVxfqeux2g.png'
  },
  {
    id: 337,
    name: 'Disney+',
    color: '#0063E5',
    logo: 'https://image.tmdb.org/t/p/original/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg'
  },
  {
    id: 2336,
    name: 'JioHotstar',
    color: '#0C3B72',
    logo: 'https://image.tmdb.org/t/p/original/ledoS6EgdjTNq8F1e6wubUQer18.png'
  },
  {
    id: 232,
    name: 'Zee5',
    color: '#8230C7',
    logo: 'https://image.tmdb.org/t/p/original/uQvhdtB8skccsGHmvKi3y5bqBsX.png'
  },
  {
    id: 237,
    name: 'SonyLIV',
    color: '#000000',
    logo: 'https://image.tmdb.org/t/p/original/coM4QWbmIOa0xJ5cGR9BRmoV25B.png'
  },
  {
    id: 350,
    name: 'Apple TV+',
    color: '#000000',
    logo: 'https://image.tmdb.org/t/p/original/9icYBfYFcwgCbky5VdGUIKJ4C5i.png'
  },
  {
    id: 1899,
    name: 'Max',
    color: '#002BE7',
    logo: 'https://image.tmdb.org/t/p/original/skypuy7SXuugIQeYg0IglmzoKaS.png'
  },
  {
    id: 283,
    name: 'Crunchyroll',
    color: '#F47521',
    logo: 'https://image.tmdb.org/t/p/original/uFL3c4Cq8M6WoLymlC5Y8bmGytV.png'
  },
  {
    id: 11,
    name: 'Mubi',
    color: '#001B2C',
    logo: 'https://image.tmdb.org/t/p/original/k7iSlvgWzZuO4zU5PcBjhABMuia.png'
  },
  {
    id: 515,
    name: 'MX Player',
    color: '#0080FF',
    logo: 'https://image.tmdb.org/t/p/original/kqwaac38jeFJRkZj9FJ09MYiyJE.png'
  },
];

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const { at, data } = JSON.parse(raw);
      if (Date.now() - at < CACHE_TTL) return data;
    }
  } catch {}
  return null;
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
      keys.slice(0, Math.ceil(keys.length / 3)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    } catch {}
  }
}

async function tmdbFetch(path, params = {}) {
  for (const key of TMDB_KEYS) {
    try {
      const qs = new URLSearchParams({ api_key: key, ...params });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${TMDB_API}${path}?${qs}`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (res.status === 401) continue;
      if (!res.ok) return null;
      return await res.json();
    } catch {}
  }
  return null;
}

function normalizeItem(item, mediaType) {
  if (!item || (!item.title && !item.name)) return null;
  // v3.12.80 (category fix): type must come from the ITEM, not the fetch's
  // mediaType bucket — a movie sitting in a TV discover page was being stamped
  // 'series', which is exactly the "mixed up" misclassification Akkshay hit.
  const isTv = Boolean(item.first_air_date) || (mediaType === 'tv' && !item.release_date);
  const title = item.title || item.name || '';
  const date = item.release_date || item.first_air_date || '';
  return {
    id: `tmdb-${isTv ? 'tv' : 'movie'}-${item.id}`,
    title: title,
    title_en: title,
    description: item.overview || '',
    poster_url: item.poster_path ? `${TMDB_IMG}/w500${item.poster_path}` : '',
    backdrop_url: item.backdrop_path ? `${TMDB_IMG}/w1280${item.backdrop_path}` : '',
    year: date ? date.split('-')[0] : '',
    rating: item.vote_average ? Number(item.vote_average).toFixed(1) : '',
    type: isTv ? 'series' : 'movie',
    // v3.12.80: category matches the resolved type so MediaGridView's filter
    // (item.category === selected) doesn't drop or cross-file the card.
    category: isTv ? 'series' : 'movie',
    tmdb_id: item.id,
    genres: (item.genre_ids || []).map(id => ({ id, name: genreMap[id] || '' })).filter(g => g.name),
  };
}

const genreMap = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics',
};

/**
 * Get content available on a specific streaming provider.
 * @param {number} providerId - TMDB provider ID
 * @param {'movie'|'tv'} mediaType - Content type
 * @param {number} page - Page number (1-indexed)
 * @param {string} region - ISO 3166-1 country code
 * @returns {Promise<{items: Array, totalPages: number}>}
 */
export async function getProviderCatalog(providerId, mediaType = 'movie', page = 1, region = 'IN') {
  const cacheKey = `cat_${providerId}_${mediaType}_${page}_${region}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch(`/discover/${mediaType}`, {
    with_watch_providers: providerId,
    watch_region: region,
    sort_by: 'popularity.desc',
    page: String(page),
    'vote_count.gte': '10',
    language: 'en-US',
  });

  if (!data || !data.results) return { items: [], totalPages: 0 };

  const items = data.results
    .map(item => normalizeItem(item, mediaType))
    .filter(Boolean);

  const result = { items, totalPages: data.total_pages || 0 };
  cacheSet(cacheKey, result);
  return result;
}

/**
 * Get available streaming providers for a region.
 */
export async function getAvailableProviders(region = 'IN') {
  const cacheKey = `providers_${region}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/watch/providers/movie', { watch_region: region });
  const result = data?.results || [];
  if (result.length > 0) cacheSet(cacheKey, result);
  return result;
}

/**
 * Get the pre-defined list of major providers with logos/colors.
 */
export function getMajorProviders() {
  return PROVIDERS;
}
