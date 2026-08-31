/**
 * AJO Mobile Offline Downloads API
 * Coordinates downloading video files to device storage, tracking progress,
 * managing storage, and launching offline video playback.
 */

const STORAGE_KEY = 'ajo_offline_downloads';
const subscribers = new Set();

function loadStoredDownloads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredDownloads(downloads) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(downloads));
  } catch (e) {
    console.warn('Could not save offline downloads to localStorage:', e);
  }
  notifySubscribers();
}

function notifySubscribers() {
  const current = loadStoredDownloads();
  subscribers.forEach(cb => {
    try { cb(current); } catch (e) { console.error(e); }
  });
}

// Global hook called by Android native bridge (AndroidDownloader in MainActivity)
if (typeof window !== 'undefined') {
  window.__ajoOnDownloadProgress = (id, percent, bytesDownloaded, totalBytes, status, localPath, error) => {
    const downloads = loadStoredDownloads();
    const item = downloads.find(d => d.id === id);
    if (!item) return;

    item.status = status; // 'downloading' | 'completed' | 'error' | 'cancelled'
    item.progress = typeof percent === 'number' ? percent : item.progress;
    item.bytesDownloaded = bytesDownloaded || item.bytesDownloaded || 0;
    item.totalBytes = totalBytes || item.totalBytes || 0;
    if (localPath) item.localPath = localPath;
    if (error) item.error = error;
    if (status === 'completed') {
      item.completedAt = new Date().toISOString();
      item.progress = 100;
    }

    saveStoredDownloads(downloads);
  };
}

export function subscribeDownloads(callback) {
  subscribers.add(callback);
  callback(loadStoredDownloads());
  return () => subscribers.delete(callback);
}

export function getDownloads() {
  return loadStoredDownloads();
}

export function getDownload(id) {
  const list = loadStoredDownloads();
  return list.find(d => d.id === id) || null;
}

export function isItemDownloaded(mediaId) {
  const list = loadStoredDownloads();
  return list.some(d => (d.mediaId === mediaId || d.id === String(mediaId)) && d.status === 'completed');
}

export function getItemDownloadStatus(mediaId) {
  const list = loadStoredDownloads();
  return list.find(d => d.mediaId === mediaId || d.id === String(mediaId)) || null;
}

/**
 * Initiates an offline download of a movie or TV series episode.
 */
export async function startOfflineDownload(item, server = null, episode = null) {
  if (!item) return { success: false, error: 'Invalid media item' };

  const id = episode 
    ? `${item.id || item.movie_id || item.tmdb_id}_s${episode.season_num || 1}e${episode.episode_num || 1}`
    : String(item.id || item.movie_id || item.tmdb_id || Date.now());

  const title = episode
    ? `${item.title || item.title_en || 'Show'} - S${episode.season_num || 1}E${episode.episode_num || 1} ${episode.title || ''}`
    : (item.title || item.title_en || item.name || 'Movie');

  const poster = episode?.poster || item.poster_url || item.poster || item.backdrop_url || '';
  
  // Choose download URL (server direct URL or item stream URL)
  let downloadUrl = server?.url || item.stream_url || item.url || '';
  
  if (!downloadUrl && Array.isArray(item.players) && item.players.length > 0) {
    const p = item.players[0];
    downloadUrl = typeof p === 'string' ? p : p.url;
  }

  if (!downloadUrl) {
    return { success: false, error: 'No downloadable stream found for this title' };
  }

  const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.mp4`;

  const downloadRecord = {
    id,
    mediaId: item.id || item.movie_id || item.tmdb_id,
    title,
    originalItem: item,
    episode: episode || null,
    poster,
    url: downloadUrl,
    filename: safeFilename,
    status: 'starting',
    progress: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
    startedAt: new Date().toISOString(),
    localPath: null,
    error: null
  };

  const downloads = loadStoredDownloads().filter(d => d.id !== id);
  downloads.unshift(downloadRecord);
  saveStoredDownloads(downloads);

  // Trigger Native Android Download if available
  if (typeof window !== 'undefined' && window.AndroidDownloader?.startDownload) {
    try {
      window.AndroidDownloader.startDownload(id, downloadUrl, title, safeFilename, 'video/mp4');
      return { success: true, id };
    } catch (e) {
      downloadRecord.status = 'error';
      downloadRecord.error = e.message;
      saveStoredDownloads(downloads);
      return { success: false, error: e.message };
    }
  } else {
    // Browser fallback: trigger standard browser download
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = safeFilename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    downloadRecord.status = 'completed';
    downloadRecord.progress = 100;
    saveStoredDownloads(downloads);
    return { success: true, id, browserFallback: true };
  }
}

export function cancelOfflineDownload(id) {
  const downloads = loadStoredDownloads();
  const item = downloads.find(d => d.id === id);
  if (item) {
    item.status = 'cancelled';
    saveStoredDownloads(downloads);
  }
  if (typeof window !== 'undefined' && window.AndroidDownloader?.cancelDownload) {
    try { window.AndroidDownloader.cancelDownload(id); } catch {}
  }
}

export function deleteOfflineDownload(id) {
  const downloads = loadStoredDownloads();
  const item = downloads.find(d => d.id === id);
  if (item && item.localPath && typeof window !== 'undefined' && window.AndroidDownloader?.deleteFile) {
    try { window.AndroidDownloader.deleteFile(item.localPath); } catch {}
  }
  const filtered = downloads.filter(d => d.id !== id);
  saveStoredDownloads(filtered);
}

export function playOfflineVideo(downloadItem) {
  if (!downloadItem) return false;
  if (downloadItem.localPath && typeof window !== 'undefined' && window.AndroidDownloader?.openOfflineVideo) {
    try {
      window.AndroidDownloader.openOfflineVideo(downloadItem.localPath, downloadItem.title);
      return true;
    } catch {}
  }
  return false;
}

export async function getDeviceStorageInfo() {
  if (typeof window !== 'undefined' && window.AndroidDownloader?.getStorageInfo) {
    try {
      const raw = window.AndroidDownloader.getStorageInfo();
      return JSON.parse(raw);
    } catch {}
  }
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      return {
        freeBytes: (est.quota || 0) - (est.usage || 0),
        totalBytes: est.quota || 0
      };
    } catch {}
  }
  return { freeBytes: 15 * 1024 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 * 1024 };
}

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
