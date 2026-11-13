const HLS_PATTERNS = [/\.m3u8(?:$|\?)/i, /\/getm3u8\//i, /\/getstream\//i, /\/live\//i, /\/playlist/i];
const DASH_PATTERNS = [/\.mpd(?:$|\?)/i];
// v3.12.73: our own VPS movibox range proxy serves progressive MP4s — classify
// as direct video so the web <video> pipeline picks them (they carry no .mp4
// extension in the path, only inside the ?url= query param).
const VIDEO_PATTERNS = [/\.(mp4|m4v|webm|mkv)(?:$|\?)/i, /\/movibox\/stream/i];

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
  /videasy\.(net|to)/i,
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


/** Synchronous TMDB id lookup used when building the server list. */
function tmdbIdOf(item) {
  const id = Number(item?.tmdb_id || item?.movie_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}


// v3.12.22: expanded dead host list based on live testing Sep 2026
// v3.17.50: re-probed Nov 7 2026 — vidsrc.to, nontongo.win, v2.vidsrc.me,
// smashystream.com and vidbinge.dev are ALL answering 200 again (they rotate
// domains and come back). Removed from the dead list and added to the chain.
const DEAD_HOSTS = [
  /mainsstreaming\.info/i, /localhost/i, /127\.0\.0\.1/i, /0\.0\.0\.0/i,
  /moviesapi\.club/i, /embed\.su/i, /moviesapi\.online/i,
  /rivestream\.live/i,        // ECONNRESET
  /vidsrc\.cc/i,              // timeout / ECONNRESET
  /vidsrc\.xyz/i,             // still 000 Nov 7
  /vidsrc\.in/i,              // still 000 Nov 7
  /vidsrc\.pro/i,             // still 000 Nov 7
  /multiembed\.mov/i,         // 403
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
  let tmdbId = item.tmdb_id || episodeInfo?.tmdb_id || null;
  // v3.12.50: 'tmdb-ep-<seriesId>-<season>-<episode>' carries the episode position too.
  // Previously only the series id was mined, so opening an episode item directly (no
  // season/episode fields anywhere) silently fell back to S1E1 — the "S2E5 plays S1E1" bug.
  let idSeason = null;
  let idEpisode = null;
  const parseEpisodeId = (id) => {
    const parts = String(id).split('-');
    if (parts[2] && /^\d+$/.test(parts[2]) && !tmdbId) tmdbId = Number(parts[2]);
    if (parts[3] && /^\d+$/.test(parts[3])) idSeason = Number(parts[3]);
    if (parts[4] && /^\d+$/.test(parts[4])) idEpisode = Number(parts[4]);
  };
  if (!tmdbId && typeof item.id === 'string') {
    if (item.id.startsWith('tmdb-ep-')) {
      parseEpisodeId(item.id);
    } else if (item.id.startsWith('tmdb-')) {
      const parts = item.id.split('-');
      const candidate = parts[parts.length - 1];
      if (/^\d+$/.test(candidate)) tmdbId = Number(candidate);
    }
  }
  if (episodeInfo && typeof episodeInfo.id === 'string' && episodeInfo.id.startsWith('tmdb-ep-')) {
    parseEpisodeId(episodeInfo.id);
  }

  const isSeries = item.category === 'serials'
    || item.type === 'series'
    || item.type === 'serial'
    || item.type === 'tv'
    || Boolean(episodeInfo)
    || Boolean(item.season_number)
    || Boolean(item.episode_number)
    || (typeof item.id === 'string' && item.id.startsWith('tmdb-ep-'));

  const season = episodeInfo?.season_number
    || episodeInfo?.season_num
    || episodeInfo?.season
    || item.season_number
    || item.season_num
    || item.season
    || idSeason
    || 1;

  const episode = episodeInfo?.episode_number
    || episodeInfo?.episode_num
    || episodeInfo?.episode
    || item.episode_number
    || item.episode_num
    || item.episode
    || idEpisode
    || 1;

  const targetId = tmdbId || imdbId;

  // v3.14.2: the chain is now ONLY hosts that render-tested alive (Oct 18
  // 2026): autoembed, vidsrc.pm, vidlink.pro, vidrift.in, vidy.st for tmdb;
  // autoembed-imdb + 2embed.cc for imdb. videasy (403), 2embed.skin
  // (non-player page), vidbolt (200-with-404), filmu (blank), cinezo
  // (timeout) and the apiplayer.ru mirror (Cloudflare interstitial = the dead
  // '12th server') are REMOVED, not demoted — dead weight is why the chain
  // stalled to 'all servers failed'.
  const animeId = item.anime ? (item.bingr_id || item.mal_id || null) : null;
  if (animeId) {
    raw.push({ url: `https://embed.filmu.in/anime/${animeId}/${episode}`, name: 'Server 1: Filmu Anime (HD)', source: 'embed', quality: '1080p' });
    raw.push({ url: `https://vidbolt.xyz/anime/${animeId}/${episode}`, name: 'Server 2: Vidbolt Anime', source: 'embed', quality: '1080p' });
    raw.push({ url: `https://embed.vidrift.in/embed/anime/${animeId}/${episode}`, name: 'Server 3: Vidrift Anime', source: 'embed', quality: '1080p' });
    raw.push({ url: `https://www.vidy.st/anime/${animeId}/${episode}`, name: 'Server 4: Vidy Anime', source: 'embed', quality: '1080p' });
    raw.push({ url: `https://player.cinezo.live/embed/anime/${animeId}/${episode}?dub=true`, name: 'Server 5: Cinezo Anime (Dub)', source: 'embed', quality: '1080p' });
  }

  if (targetId) {
    if (isSeries) {
      if (tmdbId) {
        // v3.9.14: same reorder as movies — autoembed removed (blank shell).
        raw.push({
          url: `https://vidsrc.io/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 1: VidSrc IO (1080p Multi-Failover)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.fyi/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 1b: VidSrc FYI (Next-Gen Auto-Failover)',
          source: 'embed',
          quality: '1080p'
        });
        // v3.17.49: TV chain reordered by live probe — verified hosts first.
        raw.push({
          url: `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?primaryColor=38bdf8&autoplay=true&audio=hi`,
          name: 'Server 2: VidLink Pro (HD Mirror)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.nontongo.win/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 3: NontonGo (Multi-Server HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidfast.vc/tv/${tmdbId}/${season}/${episode}?autoPlay=true`,
          name: 'Server 4: VidFast (Instant HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.pm/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 5: VidSrc PM (⚡ Ultra Fast Mirror)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.vidy.st/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 6: Vidy (Multi-Server HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.2embed.skin/embedtv/${tmdbId}&s=${season}&e=${episode}`,
          name: 'Server 7: 2Embed Skin (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://v2.vidsrc.me/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 8: VidSrc ME (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 9: VidSrc TO (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidbinge.dev/embed/tv/${tmdbId}/${season}/${episode}`,
          name: 'Server 10: VidBinge (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://player.smashystream.com/playere.php?tmdb=${tmdbId}&season=${season}&episode=${episode}`,
          name: 'Server 11: SmashyStream (HD)',
          source: 'embed',
          quality: '1080p'
        });
      }
      if (imdbId) {
        raw.push({
          url: `https://www.2embed.cc/embedtv/${imdbId}?s=${season}&e=${episode}`,
          name: 'Server 5: 2Embed CC (IMDb Backup)',
          source: 'embed',
          quality: '1080p'
        });
      }
    } else {
      if (tmdbId) {
        // v3.9.14: chain reordered by observed reliability — vidy.st rendered a
        // full multi-server 1080p player even for a fresh Netflix title
        // (Gandhari 2026), vidsrc.pm and vidrift loaded, vidlink 200-but-empty
        // for new titles. autoembed REMOVED: renders a blank shell for every
        // title (verified Oct 22 with Deadpool & Wolverine) and its hanging
        // resources delayed iframe onLoad, taxing every play ~8s before failover.
        // v3.17.25: MovieBox-style instant streaming — vidsrc.io/fyi have
        // built-in multi-server failover (like MovieBox), vidfast is verified
        // live in the tmdb-embed-providers "core" tier (github.com/anikolabs).
        // v3.17.49: chain reordered by LIVE probe (Nov 7 2026, TMDB 155).
        // vidlink 112KB / nontongo 185KB / vidfast 169KB all render real
        // player markup; vidsrc.cc + vidspark are dead, vidfast.pro 301s to
        // vidfast.vc so the .vc host is used directly.
        raw.push({
          url: `https://vidlink.pro/movie/${tmdbId}?primaryColor=38bdf8&autoplay=true&audio=hi`,
          name: 'Server 1: VidLink Pro (HD Mirror)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.nontongo.win/embed/movie/${tmdbId}`,
          name: 'Server 2: NontonGo (Multi-Server HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidfast.vc/movie/${tmdbId}?autoPlay=true`,
          name: 'Server 3: VidFast (Instant HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.pm/embed/movie/${tmdbId}`,
          name: 'Server 4: VidSrc PM (⚡ Ultra Fast Original)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.io/embed/movie/${tmdbId}`,
          name: 'Server 5: VidSrc IO (1080p Multi-Failover)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.fyi/embed/movie/${tmdbId}`,
          name: 'Server 6: VidSrc FYI (Next-Gen Auto-Failover)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://www.vidy.st/movie/${tmdbId}`,
          name: 'Server 7: Vidy (Multi-Server HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({ url: `https://embed.vidrift.in/embed/movie/${tmdbId}`, name: 'Server 8: Vidrift (HD)', source: 'embed', quality: '1080p' });
        raw.push({
          url: `https://www.2embed.skin/embed/${tmdbId}`,
          name: 'Server 9: 2Embed Skin (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://v2.vidsrc.me/embed/movie/${tmdbId}`,
          name: 'Server 10: VidSrc ME (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidsrc.to/embed/movie/${tmdbId}`,
          name: 'Server 11: VidSrc TO (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://vidbinge.dev/embed/movie/${tmdbId}`,
          name: 'Server 12: VidBinge (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://player.smashystream.com/playere.php?tmdb=${tmdbId}`,
          name: 'Server 13: SmashyStream (HD)',
          source: 'embed',
          quality: '1080p'
        });
        raw.push({
          url: `https://superembed.stream/movie/${tmdbId}`,
          name: 'Server 14: SuperEmbed (10+ servers)',
          source: 'embed',
          quality: '1080p'
        });
      }
      if (imdbId) {
        raw.push({
          url: `https://www.2embed.cc/embed/${imdbId}`,
          name: 'Server 5: 2Embed CC (IMDb Backup)',
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

  const seen = new Set();
  return orderedList.flatMap((entry, index) => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!isSafeHttpUrl(url) || isDeadHost(url) || seen.has(url)) return [];
    // v3.17.25: skip servers probed dead in the last 5 minutes
    // v3.17.51: use the SHARED healthKey — the prober writes under origin+first
    // path segment, so a bare-origin lookup never hit and dead mirrors stayed
    // in the chain.
    try {
      const cached = healthCache.get(healthKey(url));
      if (cached && !cached.alive && Date.now() - cached.at < 5 * 60 * 1000) return [];
    } catch {}
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
// v3.17.25: Server health prober — MovieBox-style "verify everything before showing"
// HEAD-probes each server's base URL. Dead servers are marked and skipped in the chain.
// Cached for 5 minutes per session.
// v3.17.26: persistent health cache — survives app restarts so dead servers
// don't reappear after relaunch. localStorage with 24h TTL.
const HEALTH_STORAGE_KEY = 'ajo_server_health_v1';
const healthCache = new Map();
// v3.17.51: ONE cache key shape for both write (probeServerHealth) and read
// (generateUniversalServers). Key = origin + first path segment — probing a
// bare origin can pass while the embed path is dead, so the compound key is
// the more honest liveness signal.
function healthKey(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.split('/').slice(0, 2).join('/');
  } catch { return String(url || ''); }
}
try {
  const raw = localStorage.getItem(HEALTH_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [origin, entry] of Object.entries(parsed)) {
      if (now - entry.at < 24 * 60 * 60 * 1000) healthCache.set(origin, entry);
    }
  }
} catch {}
function persistHealthCache() {
  try {
    const obj = {};
    for (const [k, v] of healthCache.entries()) obj[k] = v;
    localStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

export async function probeServerHealth(url) {
  if (!url) return false;
  try {
    const origin = healthKey(url);
    if (healthCache.has(origin)) {
      const cached = healthCache.get(origin);
      if (Date.now() - cached.at < 5 * 60 * 1000) return cached.alive;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(origin, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    const alive = res.ok || res.status < 500;
    healthCache.set(origin, { alive, at: Date.now() });
    persistHealthCache();
    return alive;
  } catch {
    return false;
  }
}
