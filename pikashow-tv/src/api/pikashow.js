import { getIPTVChannels, LOGO_OVERRIDES, normalizeChannelKey } from './iptv.js';
import { isSafeHttpUrl } from '../utils/streamingEngines.js';

const BASE_URL = 'https://mapi.elochkaigolochla.com/api/v1';
const CACHE_KEY = 'ajo_catalog_v6';
const CACHE_TTL = 30 * 60 * 1000;
let memoryCatalog = null;

// mapi.elochkaigolochla.com sends no CORS headers -> WebView/browser fetch is
// blocked outright. Route mapi through our VPS proxy (adds CORS + cache).
const MAPI_PROXY = 'https://new.ajo.co.in/channels/fetch?u=';
async function fetchJson(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const proxied = url && url.startsWith('https://mapi.elochkaigolochla.com')
      ? MAPI_PROXY + encodeURIComponent(url)
      : url;
    const response = await fetch(proxied, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeMediaItem(item, category = 'movie') {
  if (!item) return null;
  const live = category === 'live' || item.is_live || item.type === 'live' || item.type === 'broadcast' || item.year === 'LIVE';
  
  let title = item.title_en || item.title || item.title_ru || item.name || '';
  if (typeof title === 'object' && title !== null) {
    title = title.en || title.ru || title.name || title.title || '';
  }
  title = String(title || '').trim();
  if (!title) return null;

  const rawPlayers = Array.isArray(item.players) ? item.players
    : Array.isArray(item.player) ? item.player : [];
  
  const firstUrl = rawPlayers[0]?.url || (typeof item.url === 'string' ? item.url : '') || (typeof item.stream_url === 'string' ? item.stream_url : '');
  const hasPlayableSource = isSafeHttpUrl(firstUrl) || Boolean(item.tmdb_id || item.movie_id || item.imdb_id);

  let poster = item.poster_url || item.poster || item.logo || '';
  if (typeof poster === 'object' && poster !== null) {
    poster = poster.url || poster.src || poster.poster || '';
  }
  poster = String(poster || '').trim();

  if (live) {
    const key = normalizeChannelKey(title);
    if (LOGO_OVERRIDES[key]) {
      poster = LOGO_OVERRIDES[key];
    }
  }

  let desc = item.description || item.overview || item.plot || '';
  if (typeof desc === 'object' && desc !== null) {
    desc = desc.en || desc.ru || desc.text || '';
  }
  desc = String(desc || '').trim();

  let yearStr = null;
  if (item.year && item.year !== 'LIVE') {
    yearStr = String(item.year).trim();
  }

  let ratingStr = '';
  if (item.ratings) {
    const rawR = item.ratings.imdb || item.ratings.kinopoisk || item.ratings.rating || '';
    if (typeof rawR === 'object' && rawR !== null) {
      ratingStr = String(rawR.rating || rawR.score || rawR.imdb || '');
    } else {
      ratingStr = String(rawR || '');
    }
  } else if (typeof item.rating === 'string' || typeof item.rating === 'number') {
    ratingStr = String(item.rating);
  }
  if (ratingStr === '[object Object]') ratingStr = '';

  const rawType = String(item.type || '').toLowerCase();
  const isSeries = rawType === 'serial' || rawType === 'series' || rawType === 'tv' || category === 'serials' || (Array.isArray(item.episodes) && item.episodes.length > 0);

  return {
    ...item,
    id: String(item.id || item.tmdb_id || item.kinopoisk_id || item.movie_id || `${category}:${title}`),
    title,
    title_en: title,
    poster,
    poster_url: poster,
    backdrop_url: typeof item.backdrop_url === 'string' ? item.backdrop_url : poster,
    url: firstUrl,
    stream_url: firstUrl,
    playable: hasPlayableSource,
    is_live: live,
    type: live ? 'live' : isSeries ? 'series' : 'movie',
    category: (() => {
      let c = item.category || category;
      if (typeof c === 'object' && c !== null) {
        if (Array.isArray(c) && c.length > 0) {
          c = typeof c[0] === 'object' ? c[0]?.name || c[0]?.title || '' : String(c[0]);
        } else {
          c = c.name || c.title || c.label || c.slug || '';
        }
      }
      c = String(c || '').trim();
      if (!c || c === '[object Object]') {
        return category === 'bollywood' ? 'Bollywood' : category === 'hollywood' ? 'Hollywood' : category === 'serials' ? 'Web Series' : 'HD';
      }
      return c;
    })(),
    players: rawPlayers.length > 0 ? rawPlayers : (firstUrl ? [{ name: 'Stream', url: firstUrl, source: 'hls', quality: 'Auto' }] : []),
    player: rawPlayers.length > 0 ? rawPlayers : (firstUrl ? [{ name: 'Stream', url: firstUrl, source: 'hls', quality: 'Auto' }] : []),
    ratings: ratingStr ? { imdb: ratingStr } : null,
    rating: ratingStr,
    genres: Array.isArray(item.genres) ? item.genres.map(g => typeof g === 'object' ? g?.name || '' : String(g)) : [],
    year: yearStr,
    duration: typeof item.duration === 'string' || typeof item.duration === 'number' ? String(item.duration) : null,
    description: desc,
    provider: typeof item.provider === 'string' ? item.provider : null
  };
}

function readCachedCatalog() {
  if (memoryCatalog) return memoryCatalog;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.savedAt < CACHE_TTL) {
      return (memoryCatalog = cached.data);
    }
  } catch {}
  return null;
}

async function loadCatalog() {
  const cached = readCachedCatalog();
  if (cached) return cached;

  const payload = await fetchJson(BASE_URL + '/catalog');
  const sections = payload?.result?.full || payload?.full || [];
  const result = { all: [], bollywood: [], hollywood: [], serials: [] };
  const seen = new Set();

  for (const section of sections) {
    const name = String(section.name || '').toLowerCase();
    // Content filter: skip adult sections entirely (user-facing family app)
    if (/erotic|adult|porn|18\+|xxx/.test(name)) continue;
    for (const raw of section.movies || section.items || []) {
      const rawType = String(raw.type || '').toLowerCase();
      const isRawSerial = rawType === 'serial' || rawType === 'series' || rawType === 'tv' || raw.is_serial || Array.isArray(raw.episodes);
      const isRawMovie = rawType === 'movie' || raw.is_movie;

      let category;
      if (isRawSerial) {
        category = 'serials';
      } else if (isRawMovie) {
        category = name.includes('hollywood') ? 'hollywood' : 'bollywood';
      } else if (name.includes('hollywood')) {
        category = 'hollywood';
      } else if ((name.includes('series') || name.includes('serial') || name.includes('tv show')) && !name.includes('movie')) {
        category = 'serials';
      } else {
        category = 'bollywood';
      }

      const item = normalizeMediaItem(raw, category);
      const key = item ? String(item.id) + ':' + item.url : '';
      if (!item?.playable || seen.has(key)) continue;
      seen.add(key);

      result.all.push(item);
      result[category].push(item);
    }
  }

  memoryCatalog = result;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: result }));
  } catch {}
  return result;
}

export async function getLiveBroadcasts() {
  const groups = await Promise.allSettled([
    fetchJson(BASE_URL + '/new-broadcasts'),
    getIPTVChannels()
  ]);

  const raw = [];
  if (groups[0].status === 'fulfilled') {
    raw.push(...(Array.isArray(groups[0].value) ? groups[0].value : groups[0].value?.results || groups[0].value?.result || []));
  }
  if (groups[1].status === 'fulfilled') {
    raw.push(...groups[1].value);
  }

  // v3.8.2: dedupe by URL, not by title. iptv-org carries many distinct
  // channels whose display titles collide after lowercase ("Sony TV" etc),
  // so title-keyed dedup silently dropped hundreds of real channels.
  // URL is the identity of a channel; same URL = same channel.
  // v3.9 CURATION: the VPS broadcast catalog must pass the SAME language
  // filter as our playlists — previously it re-introduced Bangla/Telugu/
  // Tamil feeds and floated unranked channels above the priority brands.


  const { isBlockedChannelTitle, channelPriority, normalizeChannelKey: normalizeTitleKey } = await import('./iptv.js');
  const seenMap = new Map();
  raw.forEach((entry) => {
    const item = normalizeMediaItem(entry, 'live');
    if (!item?.playable) return;
    const titleKey = normalizeTitleKey(item.title_en || item.title);
    if (!titleKey || isBlockedChannelTitle(item.title_en || item.title)) return;
    
    if (seenMap.has(titleKey)) {
      const existing = seenMap.get(titleKey);
      if (item.players && item.players.length > 0) {
        const newUrl = item.players[0].url;
        // only add if this URL isn't already in the existing players list
        if (!existing.players.some(p => p.url === newUrl)) {
          existing.players.push(item.players[0]);
          existing.player = existing.players;
        }
      }
    } else {
      seenMap.set(titleKey, item);
    }
  });
  const merged = Array.from(seenMap.values());
  return merged.sort((a, b) => {
    const pa = channelPriority(a.title_en || a.title);
    const pb = channelPriority(b.title_en || b.title);
    if (pa !== pb) return pa - pb;
    return String(a.title_en || a.title).localeCompare(String(b.title_en || b.title));
  });
}

export async function getBollywoodCatalog() {
  try { return (await loadCatalog()).bollywood; } catch { return []; }
}

export async function getHollywoodCatalog() {
  try { return (await loadCatalog()).hollywood; } catch { return []; }
}

export async function getSerialsCatalog() {
  try { return (await loadCatalog()).serials; } catch { return []; }
}

export async function searchAllMedia(query) {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean) return [];

  const [catalog, live] = await Promise.allSettled([
    loadCatalog(),
    getLiveBroadcasts()
  ]);

  const items = [
    ...(catalog.status === 'fulfilled' ? catalog.value.all : []),
    ...(live.status === 'fulfilled' ? live.value : [])
  ];

  const seen = new Set();
  return items.filter((item) => {
    const hit = `${item.title} ${item.category || ''}`.toLowerCase().includes(clean);
    const key = String(item.id);
    if (!hit || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getSeriesEpisodes(movieId) {
  if (!movieId) return [];
  try {
    const data = await fetchJson(BASE_URL + '/serial/episodes/' + encodeURIComponent(movieId));
    const raw = Array.isArray(data) ? data : data?.results || data?.result || [];
    return raw.flatMap((episode, index) => {
      const sources = generateUniversalServers(episode);
      return sources.length ? [{
        ...episode,
        id: String(episode.id || `${movieId}:${index + 1}`),
        episode: String(episode.episode || index + 1),
        players: sources,
        player: sources,
        url: sources[0].url,
        playable: true
      }] : [];
    });
  } catch {
    return [];
  }
}

// Dead PikaShow vestiges removed in v3.9.0
export function getFallbackCatalog() { return []; }
export function getFallbackLiveChannels() { return []; }
