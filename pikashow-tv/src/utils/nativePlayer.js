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
 * True when playback should bypass the WebView entirely.
 * Falls back to a UA sniff for older APKs whose bridge lacks preferNative().
 */
export function shouldPreferNativePlayer() {
  const api = bridge();
  if (!api) return false;

  try {
    if (typeof api.preferNative === 'function') return Boolean(api.preferNative());
  } catch {
    // fall through to the UA heuristic
  }
  try {
    if (typeof api.isFireTv === 'function') return Boolean(api.isFireTv());
  } catch {
    // fall through to the UA heuristic
  }

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return /AFT|Fire\s?TV|AmazonWebAppPlatform|Silk/i.test(ua);
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
 * Embed/iframe mirrors (APIPlayer etc.) are HTML pages, not media — handing one
 * to the native player would just fail, so those stay in the WebView.
 */
export function isNativePlayableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\/embed\/|apiplayer\.ru|vidlink\.pro|vidsrc\.to|autoembed\.co/i.test(url)) return false;
  return true;
}

/**
 * Hand a stream to the native hardware player.
 * Returns true when the native activity was launched.
 */
export function playInNativePlayer(url, title, isLive) {
  const api = bridge();
  if (!api || !url) return false;
  if (!isNativePlayableUrl(url)) return false;
  try {
    api.playStream(String(url), String(title || (isLive ? 'Live Channel' : 'Video Stream')), Boolean(isLive));
    return true;
  } catch (error) {
    console.warn('Native player launch failed:', error);
    return false;
  }
}
