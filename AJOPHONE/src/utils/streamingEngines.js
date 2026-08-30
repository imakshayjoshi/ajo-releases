const HLS_PATTERNS = [/\.m3u8(?:$|\?)/i, /\/getm3u8\//i, /\/getstream\//i, /\/live\//i, /\/playlist/i];
const DASH_PATTERNS = [/\.mpd(?:$|\?)/i];
const VIDEO_PATTERNS = [/\.(mp4|m4v|webm|mkv)(?:$|\?)/i];

// v3.9.1 FIX: reordered — moviesapi.club and multiembed.mov have no Cloudflare
// so they are now the *first* servers a user hits.  Heavy Cloudflare providers
// (vidlink, autoembed, vidsrc.me, vidsrc.cc, embed.su) are now last-resort
// fallbacks only.  Added vidsrc.xyz (simpler domain, usually captcha-free).
// Keep EMBED_PATTERNS in sync with nativePlayer.js EMBED_HOST_PATTERNS.
const EMBED_PATTERNS = [
  /moviesapi\.club/i,
  /multiembed\.mov/i,
  /vidsrc\.icu/i,
  /vidsrc\.xyz/i,
  /superembed\.stream/i,
  /2embed\.(cc|skin)/i,
  /apiplayer\.ru/i,
  /vidlink\.pro/i,
  /vidsrc\.to/i,
  /vidsrc\.me/i,
  /vidsrc\.cc/i,
  /v2\.vidsrc\.me/i,
  /autoembed\.co/i,
  /\/embed\/?(\?|$)/i,
  /rasta428jem\.com/i,
  /humma429gix\.com/i,
  /smashy\.stream/i,
  /embed\.su/i,
];

export function isSafeHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isEmbedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return EMBED_PATTERNS.some(pattern => pattern.test(url));
}

export function detectStreamType(url, declaredType = '') {
  const cleanType = String(declaredType || '').toLowerCase();
  if (cleanType === 'm3u8' || cleanType === 'hls' || HLS_PATTERNS.some(pattern => pattern.test(url || ''))) return 'hls';
  if (cleanType === 'video' || cleanType === 'mp4' || VIDEO_PATTERNS.some(pattern => pattern.test(url || ''))) return 'video';
  if (cleanType === 'dash' || cleanType === 'mpd' || DASH_PATTERNS.some(pattern => pattern.test(url || ''))) return 'dash';
  if (cleanType === 'embed' || cleanType === 'iframe' || isEmbedUrl(url)) return 'embed';
  return 'hls'; // Default all unclassified streaming URLs to HLS media pipeline
}

export async function resolveTmdbId(item) {
  if (!item) return null;
  const id = Number(item.tmdb_id || item.movie_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Synchronous TMDB id lookup used when building the server list. */
function tmdbIdOf(item) {
  const id = Number(item?.tmdb_id || item?.movie_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * APIPlayer.ru embed mirror — a web-backup source used when every direct
 * HLS/MP4 server is down. Requires a TMDB id, so items without one get no
 * mirror. Always ranked after direct streams: an iframe cannot be handed to
 * the native ExoPlayer activity, so on Fire TV it is a last resort.
 */
function buildApiPlayerMirror(item) {
  const tmdbId = tmdbIdOf(item);
  if (!tmdbId) return null;

  const isSeries = item.category === 'serials'
    || item.type === 'series'
    || item.type === 'serial'
    || item.type === 'tv';
  const kind = isSeries ? 'tv' : 'movie';

  return {
    id: 'apiplayer-mirror',
    name: 'Web Backup Mirror (APIPlayer)',
    url: `https://apiplayer.ru/embed/${kind}/${tmdbId}?color=38bdf8&auto=1`,
    source: 'embed',
    provider: 'apiplayer',
    quality: 'Auto'
  };
}

const DEAD_HOSTS = [/mainsstreaming\.info/i, /localhost/i, /127\.0\.0\.1/i, /0\.0\.0\.0/i];

export function isDeadHost(url) {
  if (!url || typeof url !== 'string') return true;
  return DEAD_HOSTS.some(pattern => pattern.test(url));
}

export function extractImdbId(item) {
  if (!item) return null;
  if (typeof item.imdb_id === 'string' && /^tt\d+/i.test(item.imdb_id)) return item.imdb_id;
  if (typeof item.imdb === 'string' && /^tt\d+/i.test(item.imdb)) return item.imdb;
  if (typeof item.id === 'string' && /^tt\d+/i.test(item.id)) return item.id;

  const playerList = Array.isArray(item.players)
    ? item.players
    : Array.isArray(item.player)
      ? item.player
      : [];

  for (const p of playerList) {
    const u = typeof p === 'string' ? p : p?.url;
    if (!u) continue;
    const match = u.match(/(?:f)?(tt\d+)/i);
    if (match && match[1]) return match[1];
  }
  return null;
}

export function generateUniversalServers(item, episodeInfo = null) {
  if (!item) return [];

  const raw = [];
  const declared = Array.isArray(item.players)
    ? item.players
    : Array.isArray(item.player)
      ? item.player
      : item.players || item.player
        ? [item.players || item.player]
        : [];

  raw.push(...declared);
  if (item.stream_url) raw.push({ url: item.stream_url, source: 'm3u8', quality: item.quality, name: item.server_name || 'Primary Stream' });
  if (item.url) raw.push({ url: item.url, source: 'm3u8', quality: item.quality, name: item.server_name || 'Direct Stream' });

  const imdbId = extractImdbId(item);
  let tmdbId = item.tmdb_id || (typeof item.id === 'number' && item.id > 0 ? item.id : null);
  if (!tmdbId && typeof item.id === 'string') {
    if (/^\d+$/.test(item.id)) {
      tmdbId = Number(item.id);
    } else if (item.id.startsWith('tmdb-')) {
      const parts = item.id.split('-');
      const candidate = parts[parts.length - 1];
      if (/^\d+$/.test(candidate)) tmdbId = Number(candidate);
    }
  }

  const isSeries = item.category === 'serials'
    || item.type === 'series'
    || item.type === 'serial'
    || item.type === 'tv'
    || Boolean(episodeInfo);

  const season = episodeInfo?.season_num || episodeInfo?.season || 1;
  const episode = episodeInfo?.episode_num || episodeInfo?.episode || 1;

  const targetId = tmdbId || imdbId;
  if (targetId) {
    if (isSeries) {
      raw.push({
        url: tmdbId
          ? `https://vidsrc.net/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
          : `https://vidsrc.net/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`,
        name: 'Server 1: VidSrc Net (Reliable)',
        source: 'embed',
        quality: '1080p'
      });
      raw.push({
        url: `https://embed.su/embed/tv/${targetId}/${season}/${episode}`,
        name: 'Server 2: Embed SU (Fast)',
        source: 'embed',
        quality: '1080p'
      });
      raw.push({
        url: `https://vidsrc.in/embed/tv?${tmdbId ? `tmdb=${tmdbId}` : `imdb=${imdbId}`}&season=${season}&episode=${episode}`,
        name: 'Server 3: VidSrc IN (Backup)',
        source: 'embed',
        quality: '1080p'
      });
      raw.push({
        url: `https://v2.vidsrc.me/embed/tv?${tmdbId ? `tmdb=${tmdbId}` : `imdb=${imdbId}`}&season=${season}&episode=${episode}`,
        name: 'Server 4: VidSrc ME (Fallback)',
        source: 'embed',
        quality: '1080p'
      });
    } else {
      raw.push({
        url: tmdbId
          ? `https://vidsrc.net/embed/movie?tmdb=${tmdbId}`
          : `https://vidsrc.net/embed/movie?imdb=${imdbId}`,
        name: 'Server 1: VidSrc Net (Reliable)',
        source: 'embed',
        quality: '1080p'
      });
      raw.push({
        url: `https://embed.su/embed/movie/${targetId}`,
        name: 'Server 2: Embed SU (Fast)',
        source: 'embed',
        quality: '1080p'
      });
      raw.push({
        url: `https://vidsrc.in/embed/movie?${tmdbId ? `tmdb=${tmdbId}` : `imdb=${imdbId}`}`,
        name: 'Server 3: VidSrc IN (Backup)',
        source: 'embed',
        quality: '1080p'
      });
      raw.push({
        url: `https://v2.vidsrc.me/embed/movie?${tmdbId ? `tmdb=${tmdbId}` : `imdb=${imdbId}`}`,
        name: 'Server 4: VidSrc ME (Fallback)',
        source: 'embed',
        quality: '1080p'
      });
    }
  }

  // Separate direct playable streams (HLS/MP4) from embed/iframe mirrors
  const directStreams = [];
  const embedStreams = [];

  raw.forEach(entry => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!isSafeHttpUrl(url) || isDeadHost(url)) return;
    const declaredSrc = typeof entry === 'object' ? String(entry.source || entry.type || '').toLowerCase() : '';
    
    // Direct stream check
    const isDirect = (declaredSrc === 'm3u8' || 
                     declaredSrc === 'mp4' || 
                     declaredSrc === 'video' || 
                     HLS_PATTERNS.some(p => p.test(url)) || 
                     VIDEO_PATTERNS.some(p => p.test(url))) &&
                     declaredSrc !== 'iframe' &&
                     declaredSrc !== 'embed' &&
                     !isEmbedUrl(url);

    if (isDirect) {
      directStreams.push(entry);
    } else {
      embedStreams.push(entry);
    }
  });

  // Put direct HLS first, then high-reliability embed mirrors
  const orderedList = [...directStreams, ...embedStreams];
  const apiPlayerMirror = buildApiPlayerMirror(item);
  if (apiPlayerMirror) orderedList.push(apiPlayerMirror);

  const seen = new Set();
  return orderedList.flatMap((entry, index) => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!isSafeHttpUrl(url) || isDeadHost(url) || seen.has(url)) return [];
    seen.add(url);
    const type = detectStreamType(url, typeof entry === 'object' ? entry.source || entry.type : '');
    
    let name = entry?.name || entry?.translator;
    if (!name) {
      if (type === 'hls' || type === 'video') {
        name = `Server ${index + 1}: Direct HD (${type.toUpperCase()})`;
      } else {
        name = `Server ${index + 1}: High-Speed Stream Mirror`;
      }
    }

    return [{
      id: entry?.id || `source-${index + 1}`,
      name,
      url,
      source: type,
      type,
      quality: entry?.quality || 'Auto 1080p/720p',
      headers: entry?.headers || {},
      provider: entry?.provider || item.provider || item.network || 'AJO SuperCDN'
    }];
  });
}
