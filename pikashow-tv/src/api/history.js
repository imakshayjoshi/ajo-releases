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

// v3.12.59: one shared live-content check (was three drifted copies).
function isLiveContent(item) {
  return Boolean(
    item?.is_live
    || item?.type === 'live'
    || item?.year === 'LIVE'
    || item?.category === 'Live TV'
    || item?.category === 'Sports'
    || item?.category === 'News'
  );
}

export function matchMediaItem(a, b) {
  if (!a || !b) return false;
  const idA = a.id || a.tmdb_id || a.imdb_id || a.kinopoisk_id || a.movie_id;
  const idB = b.id || b.tmdb_id || b.imdb_id || b.kinopoisk_id || b.movie_id;
  if (idA && idB && String(idA) === String(idB)) return true;

  // v3.12.59 FIX: bare-title matching merged different shows that share a
  // name (remakes, same-title remasters) into one Continue Watching entry —
  // one overwrote the other's progress. Title alone now only matches when
  // the content TYPE also agrees, and when both entries have an id we never
  // fall through (two ids that differ = two different things, period).
  if (idA && idB) return false;
  const typeA = a.type || (a.category === 'Web Series' || a.category === 'Series' ? 'series' : a.category === 'Live TV' || a.category === 'Sports' || a.category === 'News' ? 'live' : '');
  const typeB = b.type || (b.category === 'Web Series' || b.category === 'Series' ? 'series' : b.category === 'Live TV' || b.category === 'Sports' || b.category === 'News' ? 'live' : '');
  const titleA = normalizeTitle(a.title_en || a.title || a.name);
  const titleB = normalizeTitle(b.title_en || b.title || b.name);
  if (titleA && titleB && titleA === titleB) {
    return typeA === typeB;
  }
  return false;
}

// ==========================================
// WATCH PROGRESS & CONTINUE WATCHING
// ==========================================
export function saveProgress(item, currentTime, duration) {
  if (!item || !duration || duration <= 0) return;
  // v3.12.59: single shared isLive check (was duplicated with drifted
  // conditions in saveProgress and getWatchProgress).
  const isLive = isLiveContent(item);
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
      // v3.12.58: slim entry. The old code spread the ENTIRE item object —
      // players arrays, mirror lists, descriptions, backdrop URLs — into
      // every history row: 30 entries ≈ 120KB serialized on every save and
      // re-parsed by every history read. Continue Watching only needs these
      // fields to render + relaunch; generateUniversalServers rebuilds the
      // mirror list from ids at play time anyway.
      id: item.id,
      tmdb_id: item.tmdb_id,
      imdb_id: item.imdb_id,
      type: item.type,
      category: item.category,
      title: item.title,
      title_en: item.title_en,
      name: item.name,
      series_title: item.series_title,
      poster_url: item.poster_url,
      poster: item.poster,
      season_number: item.season_number,
      episode_number: item.episode_number,
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
  const isLive = isLiveContent(item);
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

// v3.12.59 FIX: "clear cache" used localStorage.clear() — one Settings tap
// silently destroyed watch history, favorites, watchlist, cast pairing and
// the dead-channel list. Cache means re-fetchable data, so only sweep keys
// that repopulate from the network. User data keys are never touched here.
const CACHE_KEY_PATTERNS = [
  /^ajo_iptv_cache_v\d+$/,
  /^ajo_channels_manifest_v\d+$/,
  /^ajo_sports_cache_v\d+$/,
  /^ajo_catalog_v\d+$/,
];

export function clearAppCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const key of keys) {
      if (CACHE_KEY_PATTERNS.some((p) => p.test(key))) {
        localStorage.removeItem(key);
      }
    }
  } catch (err) {}
}

// v3.12.59: sweep ancient versioned keys left behind by upgrades (v1..v27 of
// the iptv cache etc.) — dead weight inside the 5MB localStorage quota.
// Runs once per install; only deletes keys NO current module references.
const CACHE_SWEEP_FLAG = 'ajo_cache_sweep_v1_done';
const LIVE_CACHE_KEYS = [
  'ajo_iptv_cache_v28', 'ajo_channels_manifest_v8', 'ajo_sports_cache_v2', 'ajo_catalog_v6'
];

export function sweepStaleCacheKeys() {
  try {
    if (localStorage.getItem(CACHE_SWEEP_FLAG)) return;
    const liveSet = new Set(LIVE_CACHE_KEYS);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    let removed = 0;
    for (const key of keys) {
      if (liveSet.has(key)) continue;
      if (CACHE_KEY_PATTERNS.some((p) => p.test(key))) {
        localStorage.removeItem(key);
        removed++;
      }
    }
    localStorage.setItem(CACHE_SWEEP_FLAG, String(Date.now()));
    if (removed > 0) console.warn(`[ajo] swept ${removed} stale cache key(s)`);
  } catch {}
}
