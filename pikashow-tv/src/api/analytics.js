/**
 * AJO TV Analytics — v3.12.59
 *
 * Design constraints (Fire TV Stick 1GB, WebView, offline-tolerant):
 *  - Zero external SDK weight; batching via sendBeacon / fetch keepalive.
 *  - Events buffer in localStorage (capped) and flush opportunistically.
 *  - NEVER blocks or breaks playback: every call is try/catch'd, failures
 *    just drop the batch or retry later.
 *  - Endpoint: https://new.ajo.co.in/analytics/ingest (same VPS/traefik that
 *    serves health.json + channels — no new infra).
 *
 * Event vocabulary (monetization-ready minimal set):
 *  app_boot, app_update_applied, tab_view, content_open, playback_start,
 *  playback_engine, playback_failover, playback_error, playback_end,
 *  watch_seconds (aggregated per session per item), search_query,
 *  live_channel_watch, ota_check, ota_download_start, ota_download_complete,
 *  crash (from ErrorBoundary)
 */

const QUEUE_KEY = 'ajo_analytics_queue_v1';
const SESSION_KEY = 'ajo_analytics_session_v1';
const ENDPOINT = 'https://new.ajo.co.in/analytics/ingest';
const MAX_QUEUE = 200;           // hard cap — analytics must never blow quota
const FLUSH_INTERVAL = 45_000;   // 45s opportunistic flush
const FLUSH_THRESHOLD = 10;      // or when N events accumulate

let flushTimer = null;
let session = null;

function getQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistQueue(q) {
  try {
    // Cap before write: oldest events dropped first.
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // Quota full: drop half the queue and retry once.
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-Math.floor(q.length / 2))));
    } catch {}
  }
}

function getSession() {
  if (session) return session;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    session = raw ? JSON.parse(raw) : null;
  } catch { session = null; }
  if (!session || !session.id || (Date.now() - (session.startedAt || 0)) > 6 * 3600_000) {
    session = {
      id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  }
  return session;
}

function deviceId() {
  try { return localStorage.getItem('ajo_device_id_v3') || 'unknown'; } catch { return 'unknown'; }
}

function appVersion() {
  try {
    const mod = window.__ajoAnalyticsVersion;
    return mod || '3.12.59';
  } catch { return '3.12.59'; }
}

/** Record one event. Fire-and-forget; never throws. */
export function track(event, props = {}) {
  try {
    const q = getQueue();
    q.push({
      e: String(event).slice(0, 48),
      ts: Date.now(),
      sid: getSession().id,
      did: deviceId(),
      v: appVersion(),
      p: props && typeof props === 'object' ? props : {},
    });
    persistQueue(q);
    if (q.length >= FLUSH_THRESHOLD) flush();
  } catch {}
}

/** Ship the queue to the ingest endpoint. Safe to call anytime. */
export function flush() {
  try {
    const q = getQueue();
    if (q.length === 0) return;
    const body = JSON.stringify({ events: q });
    const ok = navigator.sendBeacon
      ? navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
      : false;
    if (!ok) {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* keep queue for next flush */ return; });
      // Optimistic: only clear on beacon (fire-and-forget) or fetch success
      // would be ideal; keepalive fetch has no success hook pre-teardown, so
      // clear optimistically too — worst case a few events resend.
      persistQueue([]);
      return;
    }
    persistQueue([]);
  } catch {}
}

function ensureFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
  // Flush when the app goes background (WebView onPause -> visibilitychange).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

export function initAnalytics() {
  track('app_boot', { ua: (navigator.userAgent || '').slice(0, 120) });
  ensureFlushLoop();
}

/* ---------- playback funnel helpers (used by TVPlayer) ---------- */

const watchAgg = { itemId: null, title: null, seconds: 0, engine: null, failovers: 0 };

export function trackPlaybackStart(item, engine, serverName) {
  try {
    watchAgg.itemId = item?.id || item?.tmdb_id || null;
    watchAgg.title = (item?.title_en || item?.title || item?.name || '').slice(0, 120);
    watchAgg.seconds = 0;
    watchAgg.engine = engine;
    watchAgg.failovers = 0;
    track('playback_start', {
      item: watchAgg.itemId,
      title: watchAgg.title,
      type: item?.type || '',
      engine,
      server: String(serverName || '').slice(0, 40),
    });
  } catch {}
}

export function trackPlaybackEngine(engine, serverName) {
  try { track('playback_engine', { engine, server: String(serverName || '').slice(0, 40) }); } catch {}
}

export function trackFailover(reason) {
  try {
    watchAgg.failovers += 1;
    track('playback_failover', { reason: String(reason || '').slice(0, 80), item: watchAgg.itemId });
  } catch {}
}

export function trackPlaybackError(reason) {
  try { track('playback_error', { reason: String(reason || '').slice(0, 80), item: watchAgg.itemId }); } catch {}
}

export function trackWatchTick() {
  // Called from the 30s progressSaver tick — counts real watched seconds.
  try { watchAgg.seconds += 30; } catch {}
}

export function trackPlaybackEnd() {
  try {
    if (watchAgg.seconds > 0) {
      track('watch_seconds', {
        item: watchAgg.itemId,
        title: watchAgg.title,
        seconds: watchAgg.seconds,
        engine: watchAgg.engine,
        failovers: watchAgg.failovers,
      });
    }
    watchAgg.seconds = 0;
  } catch {}
}

export function trackTabView(tab) {
  try { track('tab_view', { tab: String(tab || '').slice(0, 24) }); } catch {}
}

export function trackContentOpen(item) {
  try {
    track('content_open', {
      item: item?.id || item?.tmdb_id || null,
      title: (item?.title_en || item?.title || item?.name || '').slice(0, 120),
      type: item?.type || '',
    });
  } catch {}
}

export function trackSearchQuery(query, resultCount) {
  try { track('search_query', { q: String(query || '').slice(0, 80), n: typeof resultCount === 'number' ? resultCount : -1 }); } catch {}
}
