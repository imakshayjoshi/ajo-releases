// Performance caching layer using IndexedDB for large datasets
// Provides multi-tier caching: catalog (30min), stream URLs (5min), channels (30min)

const DB_NAME = 'ajo_performance_cache';
const DB_VERSION = 1;
const CATALOG_STORE = 'catalog';
const STREAM_STORE = 'streams';
const CHANNEL_STORE = 'channels';

// TTL configurations (milliseconds)
const TTL = {
  CATALOG: 30 * 60 * 1000,  // 30 minutes
  STREAM: 5 * 60 * 1000,    // 5 minutes
  CHANNEL: 30 * 60 * 1000   // 30 minutes
};

// Max storage limits
const LIMITS = {
  CATALOG: 100 * 1024 * 1024, // 100MB
  STREAM: 10 * 1024 * 1024,   // 10MB
  CHANNEL: 20 * 1024 * 1024   // 20MB
};

let dbInstance = null;

/**
 * Initialize IndexedDB connection
 */
async function getDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        const catalogStore = db.createObjectStore(CATALOG_STORE, { keyPath: 'key' });
        catalogStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STREAM_STORE)) {
        const streamStore = db.createObjectStore(STREAM_STORE, { keyPath: 'key' });
        streamStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(CHANNEL_STORE)) {
        const channelStore = db.createObjectStore(CHANNEL_STORE, { keyPath: 'key' });
        channelStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Get data from a store
 */
async function get(storeName, key) {
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Check TTL
        const ttl = storeName === STREAM_STORE ? TTL.STREAM :
                     storeName === CHANNEL_STORE ? TTL.CHANNEL : TTL.CATALOG;

        if (Date.now() - result.timestamp > ttl) {
          // Expired - delete and return null
          deleteEntry(storeName, key).catch(() => {});
          resolve(null);
          return;
        }

        resolve(result.data);
      };

      request.onerror = () => reject(new Error('Failed to get data'));
    });
  } catch (err) {
    console.warn(`Cache get error (${storeName}):`, err);
    return null;
  }
}

/**
 * Set data in a store
 */
async function set(storeName, key, data) {
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    const entry = {
      key,
      data,
      timestamp: Date.now(),
      size: JSON.stringify(data).length
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error('Failed to set data'));
    });
  } catch (err) {
    console.warn(`Cache set error (${storeName}):`, err);
    return false;
  }
}

/**
 * Delete a specific entry
 */
async function deleteEntry(storeName, key) {
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error('Failed to delete entry'));
    });
  } catch (err) {
    console.warn(`Cache delete error (${storeName}):`, err);
    return false;
  }
}

/**
 * Clear entire store
 */
async function clearStore(storeName) {
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error('Failed to clear store'));
    });
  } catch (err) {
    console.warn(`Cache clear error (${storeName}):`, err);
    return false;
  }
}

/**
 * Get store size and entry count
 */
async function getStoreStats(storeName) {
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result || [];
        const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);

        resolve({
          count: entries.length,
          size: totalSize,
          sizeFormatted: formatBytes(totalSize)
        });
      };

      request.onerror = () => reject(new Error('Failed to get stats'));
    });
  } catch (err) {
    console.warn(`Cache stats error (${storeName}):`, err);
    return { count: 0, size: 0, sizeFormatted: '0 B' };
  }
}

/**
 * Cleanup expired entries from a store
 */
async function cleanupExpired(storeName) {
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const index = store.index('timestamp');

    const ttl = storeName === STREAM_STORE ? TTL.STREAM :
                 storeName === CHANNEL_STORE ? TTL.CHANNEL : TTL.CATALOG;

    const cutoffTime = Date.now() - ttl;

    return new Promise((resolve, reject) => {
      const request = index.openCursor();
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          if (cursor.value.timestamp < cutoffTime) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(new Error('Failed to cleanup'));
    });
  } catch (err) {
    console.warn(`Cache cleanup error (${storeName}):`, err);
    return 0;
  }
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// ==================== PUBLIC API ====================

/**
 * Catalog cache (movies, series, trending)
 */
export const catalogCache = {
  get: (key) => get(CATALOG_STORE, key),
  set: (key, data) => set(CATALOG_STORE, key, data),
  delete: (key) => deleteEntry(CATALOG_STORE, key),
  clear: () => clearStore(CATALOG_STORE),
  stats: () => getStoreStats(CATALOG_STORE),
  cleanup: () => cleanupExpired(CATALOG_STORE)
};

/**
 * Stream URL cache (video sources)
 */
export const streamCache = {
  get: (key) => get(STREAM_STORE, key),
  set: (key, data) => set(STREAM_STORE, key, data),
  delete: (key) => deleteEntry(STREAM_STORE, key),
  clear: () => clearStore(STREAM_STORE),
  stats: () => getStoreStats(STREAM_STORE),
  cleanup: () => cleanupExpired(STREAM_STORE)
};

/**
 * Channel list cache (IPTV channels)
 */
export const channelCache = {
  get: (key) => get(CHANNEL_STORE, key),
  set: (key, data) => set(CHANNEL_STORE, key, data),
  delete: (key) => deleteEntry(CHANNEL_STORE, key),
  clear: () => clearStore(CHANNEL_STORE),
  stats: () => getStoreStats(CHANNEL_STORE),
  cleanup: () => cleanupExpired(CHANNEL_STORE)
};

/**
 * Get overall cache statistics
 */
export async function getCacheStats() {
  try {
    const [catalog, stream, channel] = await Promise.all([
      catalogCache.stats(),
      streamCache.stats(),
      channelCache.stats()
    ]);

    return {
      catalog,
      stream,
      channel,
      total: {
        count: catalog.count + stream.count + channel.count,
        size: catalog.size + stream.size + channel.size,
        sizeFormatted: formatBytes(catalog.size + stream.size + channel.size)
      }
    };
  } catch (err) {
    console.warn('Failed to get cache stats:', err);
    return null;
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  try {
    await Promise.all([
      catalogCache.clear(),
      streamCache.clear(),
      channelCache.clear()
    ]);
    return true;
  } catch (err) {
    console.warn('Failed to clear all caches:', err);
    return false;
  }
}

/**
 * Run cleanup on all stores (remove expired entries)
 */
export async function runCleanup() {
  try {
    const [catalog, stream, channel] = await Promise.all([
      catalogCache.cleanup(),
      streamCache.cleanup(),
      channelCache.cleanup()
    ]);

    return {
      deleted: {
        catalog,
        stream,
        channel,
        total: catalog + stream + channel
      }
    };
  } catch (err) {
    console.warn('Failed to run cleanup:', err);
    return null;
  }
}

/**
 * Initialize cache system - run cleanup on startup
 */
export async function initCache() {
  try {
    await getDB();
    // Run initial cleanup to remove stale data
    await runCleanup();
    return true;
  } catch (err) {
    console.warn('Failed to initialize cache:', err);
    return false;
  }
}

// Auto-cleanup every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    runCleanup().catch(() => {});
  }, 10 * 60 * 1000);
}
