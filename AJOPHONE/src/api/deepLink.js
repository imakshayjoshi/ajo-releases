/**
 * ajo:// deep links from the Home launcher (live channel cards, Continue Watching rows, voice search).
 * Native side: MainActivity.captureDeepLink -> pendingDeepLink + window.__ajoOnDeepLink push.
 */

/** Cold start: the pending link, once. */
export function consumeDeepLink() {
  try {
    const raw = window.AjoLink && window.AjoLink.consumeDeepLink ? window.AjoLink.consumeDeepLink() : '';
    if (!raw) return null;
    const dl = JSON.parse(raw);
    return dl && dl.route ? dl : null;
  } catch {
    return null;
  }
}

/** Warm start: native pushes into the page. */
export function onDeepLink(cb) {
  window.__ajoOnDeepLink = (json) => {
    try {
      const dl = typeof json === 'string' ? JSON.parse(json) : json;
      if (dl && dl.route) cb(dl);
    } catch { /* malformed link */ }
  };
}
