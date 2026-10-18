// Additional streaming sources beyond pikashow API
import { isSafeHttpUrl } from '../utils/streamingEngines.js';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const SOURCE_CACHE_KEY = 'ajo_additional_sources_v1';

// VidSrc.to - reliable embed provider with TMDB integration
function buildVidSrcMovies() {
  return {
    provider: 'VidSrc',
    baseUrl: 'https://vidsrc.to/embed/movie/',
    type: 'embed',
    quality: '1080p',
    description: 'High-quality movie embeds'
  };
}

// Multi-Embed.mov - fast embed aggregator
function buildMultiEmbedMovies() {
  return {
    provider: 'MultiEmbed',
    baseUrl: 'https://multiembed.mov/?video_id=',
    type: 'embed',
    quality: '1080p',
    description: 'Multi-server movie embeds'
  };
}

// MoviesAPI.club - direct HLS streams
function buildMoviesApiClub() {
  return {
    provider: 'MoviesAPI',
    baseUrl: 'https://moviesapi.club/movie/',
    type: 'hls',
    quality: 'Auto',
    description: 'Direct HLS movie streams'
  };
}

// SuperEmbed.stream - reliable embed provider
function buildSuperEmbed() {
  return {
    provider: 'SuperEmbed',
    baseUrl: 'https://superembed.stream/embed/',
    type: 'embed',
    quality: '1080p',
    description: 'Fast embed streams'
  };
}

// VidSrc.icu - alternative embed provider
function buildVidSrcIcu() {
  return {
    provider: 'VidSrc ICU',
    baseUrl: 'https://vidsrc.icu/embed/movie/',
    type: 'embed',
    quality: '1080p',
    description: 'Alternative embed streams'
  };
}

/**
 * Generate streaming URLs for a movie using TMDB/IMDB ID
 */
export function generateAdditionalMovieSources(item) {
  if (!item) return [];

  const tmdbId = item.tmdb_id || item.movie_id || (typeof item.id === 'number' ? item.id : null);
  const imdbId = item.imdb_id || item.imdb || null;

  if (!tmdbId && !imdbId) return [];

  const sources = [];
  const targetId = tmdbId || imdbId;

  // VidSrc.to (TMDB/IMDB)
  if (tmdbId) {
    sources.push({
      id: 'vidsrc-to-tmdb',
      name: 'VidSrc.to (Premium)',
      url: `https://vidsrc.to/embed/movie/${tmdbId}`,
      source: 'embed',
      quality: '1080p',
      provider: 'VidSrc.to'
    });
  }
  if (imdbId) {
    sources.push({
      id: 'vidsrc-to-imdb',
      name: 'VidSrc.to (IMDB)',
      url: `https://vidsrc.to/embed/movie/${imdbId}`,
      source: 'embed',
      quality: '1080p',
      provider: 'VidSrc.to'
    });
  }

  // MultiEmbed.mov
  if (tmdbId) {
    sources.push({
      id: 'multiembed-mov',
      name: 'MultiEmbed (Fast)',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      source: 'embed',
      quality: '1080p',
      provider: 'MultiEmbed'
    });
  }

  // MoviesAPI.club (TMDB only, returns direct HLS)
  if (tmdbId) {
    sources.push({
      id: 'moviesapi-club',
      name: 'MoviesAPI (Direct HLS)',
      url: `https://moviesapi.club/movie/${tmdbId}`,
      source: 'embed',
      quality: 'Auto',
      provider: 'MoviesAPI'
    });
  }

  // SuperEmbed.stream
  if (targetId) {
    sources.push({
      id: 'superembed',
      name: 'SuperEmbed (Reliable)',
      url: `https://superembed.stream/embed/movie/${targetId}`,
      source: 'embed',
      quality: '1080p',
      provider: 'SuperEmbed'
    });
  }

  // VidSrc.icu
  if (tmdbId) {
    sources.push({
      id: 'vidsrc-icu',
      name: 'VidSrc ICU (Backup)',
      url: `https://vidsrc.icu/embed/movie/${tmdbId}`,
      source: 'embed',
      quality: '1080p',
      provider: 'VidSrc ICU'
    });
  }

  // Embed.su
  sources.push({
    id: 'embed-su',
    name: 'Embed.su (Fallback)',
    url: `https://embed.su/embed/movie/${targetId}`,
    source: 'embed',
    quality: '1080p',
    provider: 'Embed.su'
  });

  return sources.filter(s => isSafeHttpUrl(s.url));
}

/**
 * Generate streaming URLs for TV series episodes
 */
export function generateAdditionalSeriesSources(item, season, episode) {
  if (!item || !season || !episode) return [];

  const tmdbId = item.tmdb_id || item.movie_id || (typeof item.id === 'number' ? item.id : null);
  const imdbId = item.imdb_id || item.imdb || null;

  if (!tmdbId && !imdbId) return [];

  const sources = [];
  const targetId = tmdbId || imdbId;

  // VidSrc.to TV
  if (tmdbId) {
    sources.push({
      id: 'vidsrc-to-tv-tmdb',
      name: 'VidSrc.to (Premium)',
      url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`,
      source: 'embed',
      quality: '1080p',
      provider: 'VidSrc.to'
    });
  }
  if (imdbId) {
    sources.push({
      id: 'vidsrc-to-tv-imdb',
      name: 'VidSrc.to (IMDB)',
      url: `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}`,
      source: 'embed',
      quality: '1080p',
      provider: 'VidSrc.to'
    });
  }

  // MultiEmbed.mov TV
  if (tmdbId) {
    sources.push({
      id: 'multiembed-tv',
      name: 'MultiEmbed (Fast)',
      url: `https://multiembed.mov/embedtv.php?tmdb=${tmdbId}&season=${season}&episode=${episode}`,
      source: 'embed',
      quality: '1080p',
      provider: 'MultiEmbed'
    });
  }

  // SuperEmbed.stream TV
  sources.push({
    id: 'superembed-tv',
    name: 'SuperEmbed (Reliable)',
    url: `https://superembed.stream/embed/tv/${targetId}/${season}/${episode}`,
    source: 'embed',
    quality: '1080p',
    provider: 'SuperEmbed'
  });

  // VidSrc.icu TV
  if (tmdbId) {
    sources.push({
      id: 'vidsrc-icu-tv',
      name: 'VidSrc ICU (Backup)',
      url: `https://vidsrc.icu/embed/tv/${tmdbId}/${season}/${episode}`,
      source: 'embed',
      quality: '1080p',
      provider: 'VidSrc ICU'
    });
  }

  // Embed.su TV
  sources.push({
    id: 'embed-su-tv',
    name: 'Embed.su (Fallback)',
    url: `https://embed.su/embed/tv/${targetId}/${season}/${episode}`,
    source: 'embed',
    quality: '1080p',
    provider: 'Embed.su'
  });

  return sources.filter(s => isSafeHttpUrl(s.url));
}

/**
 * Enhanced TMDB trending with more sources
 */
export async function getEnhancedTrending() {
  try {
    const cached = localStorage.getItem(SOURCE_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < CACHE_TTL) {
        return data.items;
      }
    }
  } catch {}

  // Fetch from TMDB trending (assuming tmdb.js exists)
  try {
    const { getTmdbTrending } = await import('./tmdb.js');
    const trending = await getTmdbTrending();

    // Enhance each item with additional sources
    const enhanced = trending.map(item => ({
      ...item,
      additionalSources: item.type === 'movie'
        ? generateAdditionalMovieSources(item)
        : []
    }));

    localStorage.setItem(SOURCE_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      items: enhanced
    }));

    return enhanced;
  } catch (err) {
    console.warn('Failed to enhance trending:', err);
    return [];
  }
}

/**
 * Get all available streaming providers
 */
export function getStreamingProviders() {
  return [
    buildVidSrcMovies(),
    buildMultiEmbedMovies(),
    buildMoviesApiClub(),
    buildSuperEmbed(),
    buildVidSrcIcu()
  ];
}

/**
 * Merge additional sources with existing players
 */
export function mergeStreamingSources(item, existingPlayers = []) {
  const isSeries = item.type === 'series' || item.type === 'tv' || item.category === 'serials';

  if (isSeries) {
    // For series, additional sources added per-episode
    return existingPlayers;
  }

  const additional = generateAdditionalMovieSources(item);
  const merged = [...existingPlayers];

  // Add additional sources that aren't duplicates
  const existingUrls = new Set(existingPlayers.map(p => p.url));
  additional.forEach(source => {
    if (!existingUrls.has(source.url)) {
      merged.push(source);
      existingUrls.add(source.url);
    }
  });

  return merged;
}
