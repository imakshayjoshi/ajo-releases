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
    localStorage.clear();
  } catch (err) {}
}
