/**
 * Watch History, Media Favorites, Channel Favorites & Personalization Manager
 */

const HISTORY_KEY = 'ajo_watch_history_v1';
const FAVORITES_KEY = 'ajo_favorites_v1';
const FAV_CHANNELS_KEY = 'ajo_fav_channels_v1';
const SLEEP_TIMER_KEY = 'ajo_sleep_timer_state';

// ==========================================
// WATCH PROGRESS & CONTINUE WATCHING
// ==========================================
export function saveProgress(item, currentTime, duration) {
  if (!item || !duration || duration <= 0) return;

  const percentage = Math.min(100, Math.max(0, Math.round((currentTime / duration) * 100)));
  
  if (percentage > 95) return;
  if (currentTime < 30) return; // skip accidental taps; any real watch counts

  try {
    const history = getWatchHistory();
    const existingIndex = history.findIndex(h => (h.id && h.id === item.id) || h.title === item.title);

    const historyEntry = {
      ...item,
      currentTime,
      duration,
      percentage,
      lastWatched: Date.now()
    };

    if (existingIndex !== -1) {
      history.splice(existingIndex, 1);
    }
    history.unshift(historyEntry);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
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

export function deleteHistoryItem(item) {
  if (!item) return;
  try {
    const history = getWatchHistory();
    const itemId = item.id || item.kinopoisk_id || item.movie_id || item.title;
    const filtered = history.filter(h => (h.id || h.kinopoisk_id || h.movie_id || h.title) !== itemId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (err) {}
}

export function clearWatchHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
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
  const itemId = item.id || item.tmdb_id || item.kinopoisk_id || item.movie_id || item.title;
  return favs.some(f => (f.id || f.tmdb_id || f.kinopoisk_id || f.movie_id || f.title) === itemId);
}

export function toggleFavorite(item) {
  if (!item) return false;
  try {
    const favs = getFavorites();
    const itemId = item.id || item.tmdb_id || item.kinopoisk_id || item.movie_id || item.title;
    const index = favs.findIndex(f => (f.id || f.tmdb_id || f.kinopoisk_id || f.movie_id || f.title) === itemId);

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
