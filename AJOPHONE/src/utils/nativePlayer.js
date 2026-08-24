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
const EMBED_HOST_PATTERNS = [
  /apiplayer\.ru/i,
  /vidlink\.pro/i,
  /vidsrc\.to/i,
  /vidsrc\./i,
  /autoembed\.co/i,
  /rasta428jem\.com/i,
  /humma429gix\.com/i,
  /smashy\.stream/i,
  /multiembed\.mov/i,
  /\/embed\//i,
  /\/play\//i,
  /vidsrc\.me/i
];

const DEAD_HOST_PATTERNS = [
  /mainsstreaming\.info/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /0\.0\.0\.0/i
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

/**
 * True when a URL is a direct media stream ExoPlayer can decode.
 * Embed/iframe mirrors (APIPlayer, VidSrc, AutoEmbed, etc.) are HTML pages,
 * not media — handing one to the native player would just fail, so those
 * stay in the WebView. This is the gate that decides the entire hybrid
 * routing decision.
 */
export function isNativePlayableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  for (const pattern of EMBED_HOST_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  for (const pattern of DEAD_HOST_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  return true;
}

/**
 * Hand a stream to the native hardware player with optional failover servers.
 * Returns true when the native activity was launched.
 */
export function playInNativePlayer(url, title, isLive, fallbackUrls = []) {
  const api = bridge();
  if (!api || !url) return false;
  if (!isNativePlayableUrl(url)) return false;
  try {
    const urlsJson = Array.isArray(fallbackUrls) && fallbackUrls.length > 0
      ? JSON.stringify(fallbackUrls.map(u => typeof u === 'string' ? u : u?.url).filter(Boolean))
      : '';
    if (typeof api.playStreamWithFallbacks === 'function') {
      api.playStreamWithFallbacks(
        String(url),
        String(title || (isLive ? 'Live Channel' : 'Video Stream')),
        Boolean(isLive),
        urlsJson
      );
      return true;
    }
    api.playStream(String(url), String(title || (isLive ? 'Live Channel' : 'Video Stream')), Boolean(isLive));
    return true;
  } catch (error) {
    console.warn('Native player launch failed:', error);
    return false;
  }
}
