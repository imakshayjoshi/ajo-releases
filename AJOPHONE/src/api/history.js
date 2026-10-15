/**
 * Watch History, Media Favorites, Channel Favorites & Personalization Manager
 */

const HISTORY_KEY = 'ajo_watch_history_v1';
const FAVORITES_KEY = 'ajo_favorites_v1';
const FAV_CHANNELS_KEY = 'ajo_fav_channels_v1';
const SLEEP_TIMER_KEY = 'ajo_sleep_timer_state';

function normalizeTitle(t) {
  return String(t || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

export function matchMediaItem(a, b) {
  if (!a || !b) return false;
  const idA = a.id || a.tmdb_id || a.imdb_id || a.kinopoisk_id || a.movie_id;
  const idB = b.id || b.tmdb_id || b.imdb_id || b.kinopoisk_id || b.movie_id;
  if (idA && idB && String(idA) === String(idB)) return true;

  const titleA = normalizeTitle(a.title_en || a.title || a.name);
  const titleB = normalizeTitle(b.title_en || b.title || b.name);
  if (titleA && titleB && titleA === titleB) return true;
  return false;
}

// ==========================================
// WATCH PROGRESS & CONTINUE WATCHING
// ==========================================
export function saveProgress(item, currentTime, duration) {
  if (!item || !duration || duration <= 0) return;
  const isLive = Boolean(item.is_live || item.type === 'live' || item.year === 'LIVE' || item.category === 'Live TV' || item.category === 'Sports' || item.category === 'News');
  if (isLive) return;

  const percentage = Math.min(100, Math.max(0, Math.round((currentTime / duration) * 100)));

  // If content is finished (>92%), remove from Continue Watching
  if (percentage >= 92) {
    deleteHistoryItem(item);
    return;
  }

  // Any real playback > 5 seconds counts
  if (currentTime < 5) return;

  try {
    const history = getWatchHistory();
    const existingIndex = history.findIndex(h => matchMediaItem(h, item));

    const historyEntry = {
      ...item,
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
      percentage,
      lastWatched: Date.now()
    };

    if (existingIndex !== -1) {
      history.splice(existingIndex, 1);
    }
    history.unshift(historyEntry);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ajo-watch-history-updated', { detail: historyEntry }));
    }
  } catch (err) {
    console.warn("Failed to save progress:", err);
  }
}

export function getWatchHistory() {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    return [];
  }
}

export function getWatchProgress(item) {
  if (!item) return null;
  const isLive = Boolean(item.is_live || item.type === 'live' || item.year === 'LIVE');
  if (isLive) return null;
  try {
    const history = getWatchHistory();
    const entry = history.find(h => matchMediaItem(h, item));
    if (entry && entry.currentTime >= 5 && entry.percentage < 92) {
      return entry;
    }
  } catch {}
  return null;
}

export function deleteHistoryItem(item) {
  if (!item) return;
  try {
    const history = getWatchHistory();
    const filtered = history.filter(h => !matchMediaItem(h, item));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ajo-watch-history-updated'));
    }
  } catch (err) {}
}

export function clearWatchHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ajo-watch-history-updated'));
    }
  } catch (err) {}
}

// ==========================================
// MY WATCHLIST & MOVIE/SHOW FAVORITES
// ==========================================
export function getFavorites() {
  try {
    const data = localStorage.getItem(FAVORITES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    return [];
  }
}

export function isFavorite(item) {
  if (!item) return false;
  const favs = getFavorites();
  return favs.some(f => matchMediaItem(f, item));
}

export function toggleFavorite(item) {
  if (!item) return false;
  try {
    const favs = getFavorites();
    const index = favs.findIndex(f => matchMediaItem(f, item));

    let isNowFav = false;
    if (index !== -1) {
      favs.splice(index, 1);
      isNowFav = false;
    } else {
      favs.unshift({
        ...item,
        addedAt: Date.now()
      });
      isNowFav = true;
    }

    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    return isNowFav;
  } catch (err) {
    console.warn("Failed to toggle favorite:", err);
    return false;
  }
}

// ==========================================
// CHANNEL FAVORITES & PINNING
// ==========================================
export function getFavoriteChannels() {
  try {
    const data = localStorage.getItem(FAV_CHANNELS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    return [];
  }
}

export function isFavoriteChannel(channel) {
  if (!channel) return false;
  const favChannels = getFavoriteChannels();
  const chId = channel.id || channel.title;
  return favChannels.some(c => (c.id || c.title) === chId);
}

export function toggleFavoriteChannel(channel) {
  if (!channel) return false;
  try {
    const favChannels = getFavoriteChannels();
    const chId = channel.id || channel.title;
    const index = favChannels.findIndex(c => (c.id || c.title) === chId);

    let isNowFav = false;
    if (index !== -1) {
      favChannels.splice(index, 1);
      isNowFav = false;
    } else {
      favChannels.unshift({
        ...channel,
        is_favorite: true,
        favoritedAt: Date.now()
      });
      isNowFav = true;
    }

    localStorage.setItem(FAV_CHANNELS_KEY, JSON.stringify(favChannels));
    return isNowFav;
  } catch (err) {
    console.warn("Failed to toggle favorite channel:", err);
    return false;
  }
}

// ==========================================
// BEDTIME SLEEP TIMER
// ==========================================
let sleepTimerTimeout = null;

export function setSleepTimer(minutes, onTrigger) {
  if (sleepTimerTimeout) {
    clearTimeout(sleepTimerTimeout);
    sleepTimerTimeout = null;
  }

  if (!minutes || minutes <= 0) {
    localStorage.removeItem(SLEEP_TIMER_KEY);
    return;
  }

  const expireTime = Date.now() + (minutes * 60 * 1000);
  localStorage.setItem(SLEEP_TIMER_KEY, JSON.stringify({ minutes, expireTime }));

  sleepTimerTimeout = setTimeout(() => {
    localStorage.removeItem(SLEEP_TIMER_KEY);
    if (onTrigger) onTrigger();
  }, minutes * 60 * 1000);
}

export function clearAppCache() {
  try {
    // v3.12.59 FIX (ported): was localStorage.clear() — one Settings tap
    // destroyed watch history, favorites, watchlist and cast pairing. Only
    // cache keys (re-fetchable data) are removed now.
    const CACHE_KEY_PATTERNS = [
      /^ajo_iptv_cache_v\d+$/,
      /^ajo_channels_manifest_v\d+$/,
      /^ajo_sports_cache_v\d+$/,
      /^ajo_catalog_v\d+$/,
      /^ajo_dead_items_v\d+$/,      // v3.4.1: dead-title blocklist
    ];
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const key of keys) {
      if (CACHE_KEY_PATTERNS.some((p) => p.test(key))) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}
// v3.4.1 / phone v3.4.1: dead-item blocklist — when every stream source for
// a title fails, the title stops appearing in catalogs and search until its
// TTL expires (sources recover all the time). Delivers "only show thumbnails
// that actually stream" reactively, without probing thousands of items.
const DEAD_ITEMS_KEY = 'ajo_dead_items_v1';
const DEAD_ITEM_TTL = 14 * 24 * 60 * 60 * 1000;

function readDeadItemMap() {
  try {
    const raw = localStorage.getItem(DEAD_ITEMS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const pruned = {};
    for (const [id, ts] of Object.entries(map)) {
      if (now - Number(ts) < DEAD_ITEM_TTL) pruned[id] = ts;
    }
    return pruned;
  } catch { return {}; }
}

export function markItemDead(itemId) {
  if (!itemId) return;
  try {
    const map = readDeadItemMap();
    map[String(itemId)] = Date.now();
    // bound the map so years of failures can't grow localStorage forever
    const entries = Object.entries(map);
    if (entries.length > 500) {
      entries.sort((a, b) => b[1] - a[1]);
      const trimmed = Object.fromEntries(entries.slice(0, 500));
      localStorage.setItem(DEAD_ITEMS_KEY, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(DEAD_ITEMS_KEY, JSON.stringify(map));
  } catch {}
}

export function getDeadItemIds() {
  return new Set(Object.keys(readDeadItemMap()));
}

export function isItemDead(itemId) {
  if (!itemId) return false;
  return Boolean(readDeadItemMap()[String(itemId)]);
}

/** Filter helper for catalog/search arrays. */
export function filterAliveItems(items) {
  if (!Array.isArray(items) || !items.length) return items || [];
  const dead = getDeadItemIds();
  if (!dead.size) return items;
  return items.filter((i) => i && !dead.has(String(i.id)));
}
