const HLS_PATTERNS = [/\.m3u8(?:$|\?)/i, /\/getm3u8\//i, /\/getstream\//i, /\/live\//i, /\/playlist/i];
const DASH_PATTERNS = [/\.mpd(?:$|\?)/i];
const VIDEO_PATTERNS = [/\.(mp4|m4v|webm|mkv)(?:$|\?)/i];

// v3.12.20 FIX: purged dead providers, reordered by reliability.
// Confirmed alive (Aug 2026): VidLink, VidSrc PM, AutoEmbed, VidJoy,
// NontonGo, VidSrc IN, 2embed.skin, VidSrc Pro (301 redirect but works).
// Keep EMBED_PATTERNS in sync with nativePlayer.js EMBED_HOST_PATTERNS.
const EMBED_PATTERNS = [
  /vidlink\.pro/i,
  /vidsrc\.pm/i,
  /autoembed\.co/i,
  /autoembed\.cc/i,
  /2embed\.(cc|skin)/i,
  /vidjoy\.pro/i,
  /vidsrc\.pro/i,
  /nontongo\.win/i,
  /vidsrc\.in/i,
  /vidsrc\.net/i,
  /vidsrc\.cc/i,
  /vidsrc\.xyz/i,
  /vidsrc\.io/i,
  /vidsrc\.to/i,
  /vidsrc\.me/i,
  /v2\.vidsrc\.me/i,
  /rivestream\.live/i,
  /smashystream\.com/i,
  /apiplayer\.ru/i,
  /multiembed\.mov/i,
  /\/embed\/?(\?|$)/i,
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
 * HLS/MP4 server is down.
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
    name: 'Backup Mirror (APIPlayer)',
    url: `https://apiplayer.ru/embed/${kind}/${tmdbId}?color=38bdf8&auto=1`,
    source: 'embed',
    provider: 'apiplayer',
    quality: 'Auto'
  };
}

// v3.12.20: expanded dead host list based on live testing Aug 2026
const DEAD_HOSTS = [
  /mainsstreaming\.info/i, /localhost/i, /127\.0\.0\.1/i, /0\.0\.0\.0/i,
  /moviesapi\.club/i, /embed\.su/i, /moviesapi\.online/i,
  /rivestream\.live/i,        // ECONNRESET
  /vidsrc\.cc/i,              // timeout / ECONNRESET
  /vidsrc\.xyz/i,             // timeout / ECONNRESET
  /vidsrc\.to/i,              // ECONNRESET
  /vidsrc\.io/i,              // ECONNRESET
  /v2\.vidsrc\.me/i,          // ECONNRESET
  /smashystream\.com/i,       // TLS cert error
  /apiplayer\.ru/i,           // 502 Bad Gateway
  /multiembed\.mov/i,         // 403
  /vidbinge\.dev/i,           // TLS cert error
  /sus\.stream/i,             // ENOTFOUND
  /filmxy\.wafflehacker/i,    // ENOTFOUND
];

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
      // v3.12.20: reordered series servers — confirmed-alive first, dead removed.
      if (tmdbId) {
        raw.push({
          url: `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 1: VidLink (Fast 1080p)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.pm/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 2: VidSrc PM (Fast)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://autoembed.co/tv/tmdb/${tmdbId}?s=${season}&e=${episode}`,
          name: 'Server 3: AutoEmbed (Reliable)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidjoy.pro/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 4: VidJoy Pro (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.nontongo.win/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 5: NontonGo (Direct)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.in/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 6: VidSrc IN (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://2embed.skin/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 7: 2Embed Skin (Backup)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.pro/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 8: VidSrc Pro (Full HD)',
          source: 'embed',
          quality: '1080p'
        });
      }
      if (imdbId) {
        raw.push({
          url: `https://autoembed.co/tv/imdb/${imdbId}?s=${season}&e=${episode}`,
          name: 'Server 9: AutoEmbed IMDb (No CF)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.2embed.cc/embedtv/${imdbId}?s=${season}&e=${episode}`,
          name: 'Server 10: 2Embed CC (Backup)',
          source: 'embed',
          quality: '1080p'
        });
      }
    } else {
      // v3.12.20: reordered movie servers — confirmed-alive first, dead removed.
      if (tmdbId) {
        raw.push({
          url: `https://vidlink.pro/movie/${tmdbId}`,
          name: 'Server 1: VidLink (Fast 1080p)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.pm/embed/movie/${tmdbId}`,
          name: 'Server 2: VidSrc PM (Fast)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://autoembed.co/movie/tmdb/${tmdbId}`,
          name: 'Server 3: AutoEmbed (Reliable)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidjoy.pro/embed/movie/${tmdbId}`,
          name: 'Server 4: VidJoy Pro (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.nontongo.win/embed/movie/${tmdbId}`,
          name: 'Server 5: NontonGo (Direct)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.in/embed/movie/${tmdbId}`,
          name: 'Server 6: VidSrc IN (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://2embed.skin/embed/movie/${tmdbId}`,
          name: 'Server 7: 2Embed Skin (Backup)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.pro/embed/movie/${tmdbId}`,
          name: 'Server 8: VidSrc Pro (Full HD)',
          source: 'embed',
          quality: '1080p'
        });
      }
      if (imdbId) {
        raw.push({
          url: `https://autoembed.co/movie/imdb/${imdbId}`,
          name: 'Server 9: AutoEmbed IMDb (No CF)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.2embed.cc/embedmovie/${imdbId}`,
          name: 'Server 10: 2Embed CC (Backup)',
          source: 'embed',
          quality: '1080p'
        });
      }
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
