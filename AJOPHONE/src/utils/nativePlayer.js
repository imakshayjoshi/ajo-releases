/**
 * Bridge helpers for the native AndroidX Media3 / ExoPlayer activity
 * (com.pikashow.tv.PlayerActivity) exposed by MainActivity as
 * window.AndroidNativePlayer.
 *
 * Why: on legacy Fire OS / Android TV WebViews, inline <video> + MSE (Hls.js)
 * does not hole-punch the hardware video plane — audio plays while the surface
 * stays pitch black. When a native player is available we hand the stream off
 * to it instead of fighting the WebView compositor.
 */

// Mirrors the EMBED_PATTERNS set in streamingEngines.js, kept inline so this
// module has no runtime dependency on the streaming engine (which would cycle
// back to nativePlayer through the player UI). Keep both in sync.
//
// v3.8.2 CRITICAL FIX: removed /\/play\//i from this list. It matched ANY url
// containing "/play/" — including legitimate direct streams like
// https://host/play/stream.m3u8 — so those got classified as iframe embeds,
// skipped for the native player, and the UI showed "Not supported on TV" for
// every movie whose mirrors used that path shape.
//
// v3.9.1: Added vidsrc.xyz and superembed.stream; aligned with updated EMBED_PATTERNS.
const EMBED_HOST_PATTERNS = [
  /vidlink\.pro/i,
  /vidsrc\.pm/i,
  /autoembed\.co/i,
  /autoembed\.cc/i,
  /2embed\.(cc|skin)/i,
  /vidjoy\.pro/i,
  /vidsrc\.pro/i,
  /rivestream\.live/i,
  /vidsrc/i,
  /apiplayer\.ru/i,
  /smashystream/i,
  /\/embed(\/|\?|$)/i,
];

const DEAD_HOST_PATTERNS = [
  /mainsstreaming\.info/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /0\.0\.0\.0/i,
  /moviesapi\.club/i,
  /embed\.su/i
];

function bridge() {
  if (typeof window === 'undefined') return null;
  const api = window.AndroidNativePlayer;
  if (!api || typeof api.playStream !== 'function') return null;
  return api;
}

/** True when the native ExoPlayer activity can be launched at all. */
export function hasNativePlayer() {
  return Boolean(bridge());
}

/**
 * True when playback should bypass the WebView entirely. Decision order:
 * 1. Bridge `preferNative()` if exposed.
 * 2. Bridge `isFireTv()` if exposed.
 * 3. Fire TV / Android TV user-agent sniff (last resort for old builds).
 * 4. Default false (stay on the web pipeline).
 *
 * The bridge may throw on legacy firmware — treat that as "no signal".
 */
export function shouldPreferNativePlayer() {
  const api = bridge();
  if (!api) return false;
  try {
    if (typeof api.preferNative === 'function') {
      const flag = api.preferNative();
      if (typeof flag === 'boolean') return flag;
    }
    if (typeof api.isFireTv === 'function') {
      const flag = api.isFireTv();
      if (typeof flag === 'boolean') return flag;
    }
  } catch {
    // Bridge died; fall through to UA detection.
  }
  try {
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '').toLowerCase();
    if (!ua) return false;
    // Amazon Fire TV (AFT* model OR Fire OS / Silk)
    if (/aft[a-z0-9]+|fire\s?tv|firetv|silk-accelerated/.test(ua)) return true;
    // Android TV / Google TV leanback hint
    if (/android\s?tv|google\s?tv/.test(ua)) return true;
    if (/;\s*([a-z0-9_-]+)\s+build\/.*(ns[0-9]+|aft[a-z0-9]+)/i.test(ua)) return true;
  } catch {
    return false;
  }
  return false;
}

// v3.10.1: embed preflight registry. The native bridge fetches the embed
// page's HTML and reports whether it is a broken server-error page; the React
// player skips broken mirrors BEFORE mounting the iframe (no error-page flash).
const preflightPending = new Map();

/** Result hook, called by MainActivity.preflightEmbed via evaluateJavascript. */
export function __ajoEmbedPreflightResult(urlB64, ok) {
  let url = '';
  try {
    url = atob(urlB64.replace(/-/g, '+').replace(/_/g, '/'));
  } catch { return; }
  const resolve = preflightPending.get(url);
  if (resolve) {
    preflightPending.delete(url);
    resolve(ok ? 'ok' : 'error');
  }
}
if (typeof window !== 'undefined') {
  window.__ajoEmbedPreflightResult = __ajoEmbedPreflightResult;
}

/**
 * Ask the native layer whether an embed URL currently serves a broken
 * server-error page (Vercel "Application error", 52x, 50x, CF interstitial).
 * Resolves:
 *   'ok'    — page looks healthy
 *   'error' — page is a server-error page or unreachable
 *   null    — bridge unavailable (caller should proceed optimistically)
 */
export function preflightEmbedUrl(url) {
  const api = bridge();
  if (!url || typeof api?.preflightEmbed !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    preflightPending.set(url, resolve);
    try {
      api.preflightEmbed(String(url));
    } catch {
      preflightPending.delete(url);
      resolve(null);
    }
    setTimeout(() => {
      if (preflightPending.has(url)) {
        preflightPending.delete(url);
        resolve(null); // timed out — treat as unknown, allow the attempt
      }
    }, 8000);
  });
}

/** Short device description for diagnostics / settings screens. */
export function nativeDeviceInfo() {
  const api = bridge();
  if (!api || typeof api.getDeviceInfo !== 'function') return '';
  try {
    return String(api.getDeviceInfo() || '');
  } catch {
    return '';
  }
}

const DIRECT_MEDIA_EXT_RE = /\.(m3u8|mp4|m4v|mkv|webm|mpd)($|\?)/i;

export function isDirectMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  for (const pattern of EMBED_HOST_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  for (const pattern of DEAD_HOST_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  if (/\/play\//i.test(url) && !DIRECT_MEDIA_EXT_RE.test(url)) return false;
  return true;
}

export function isNativePlayableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  for (const pattern of EMBED_HOST_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  for (const pattern of DEAD_HOST_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  if (/\/play\//i.test(url) && !DIRECT_MEDIA_EXT_RE.test(url)) return false;
  return true;
}

/**
 * Hand a stream to the native hardware player with optional failover servers.
 * Returns true when the native activity was launched.
 *
 * v3.9.1 FIX: filter fallbackUrls to only pass native-playable (direct HLS/MP4)
 * URLs to the Java serverQueue. Embed URLs in the fallback list previously caused
 * the Java side to route them through the WebView engine, showing captcha when
 * ExoPlayer failed over to an iframe mirror.
 */
// v3.11.1: module-level flag so the cast/remote handler can route commands to
// the native ExoPlayer surface (WebView <video> isn't playing during native
// playback). Set true by playInNativePlayer; cleared when the native activity
// closes (App listens for 'ajo-native-player-closed').
let nativePlaybackActive = false;

/** True while the native ExoPlayer activity owns playback. */
export function isNativePlaybackActive() {
  return nativePlaybackActive;
}

/** Route a remote command (PLAY/PAUSE/PLAY_PAUSE/SEEK_FORWARD/SEEK_BACK/SEEK/STOP) to the native player. */
export function nativePlayerControl(cmd, arg = 0) {
  const api = bridge();
  if (!api || typeof api.nativePlayerCommand !== 'function') return false;
  try {
    api.nativePlayerCommand(String(cmd), Number(arg) || 0);
    return true;
  } catch (e) {
    console.warn('Native player command failed:', e);
    return false;
  }
}

/** Mark native playback state (used by the player lifecycle bridges). */
export function setNativePlaybackActive(active) {
  nativePlaybackActive = Boolean(active);
}

export function playInNativePlayer(url, title, isLive, fallbackUrls = []) {
  const api = bridge();
  if (!api || !url) return false;
  if (!isNativePlayableUrl(url)) return false;
  try {
    // Only native-playable URLs belong in the hardware player's failover queue.
    // Embed/iframe sources are served by the React WebView layer, not ExoPlayer.
    const nativeFallbacks = Array.isArray(fallbackUrls)
      ? fallbackUrls
          .map(u => typeof u === 'string' ? u : u?.url)
          .filter(u => u && u !== url && isNativePlayableUrl(u))
      : [];

    const urlsJson = nativeFallbacks.length > 0
      ? JSON.stringify(nativeFallbacks)
      : '';

    if (typeof api.playStreamWithFallbacks === 'function') {
      api.playStreamWithFallbacks(
        String(url),
        String(title || (isLive ? 'Live Channel' : 'Video Stream')),
        Boolean(isLive),
        urlsJson
      );
      nativePlaybackActive = true;
      return true;
    }
    api.playStream(String(url), String(title || (isLive ? 'Live Channel' : 'Video Stream')), Boolean(isLive));
    nativePlaybackActive = true;
    return true;
  } catch (error) {
    console.warn('Native player launch failed:', error);
    return false;
  }
}
