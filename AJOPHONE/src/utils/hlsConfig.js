// Optimized HLS.js configuration for smooth playback
// Tuned for low-latency live streaming and reliable VOD delivery

/**
 * Get HLS.js configuration optimized for live streams
 */
export function getLiveConfig(headers = {}) {
  return {
    enableWorker: false,
    startLevel: -1,
    capLevelToPlayerSize: true,
    testBandwidth: true,

    // Bandwidth estimation
    abrEwmaDefaultEstimate: 1200000, // 1.2 Mbps starting estimate
    abrBandWidthFactor: 0.85,        // Conservative bandwidth multiplier
    abrBandWidthUpFactor: 0.7,       // Slower quality upgrades

    // Buffer configuration (optimized for live)
    maxBufferLength: 8,               // Low buffer for minimal latency (was 60s)
    liveSyncDurationCount: 2,         // Stay close to live edge
    maxMaxBufferLength: 15,           // Maximum buffer cap
    backBufferLength: 0,              // No back buffer for live
    maxBufferHole: 0.3,               // Small gap tolerance

    // Low-latency mode
    lowLatencyMode: true,             // Enable LL-HLS
    liveMaxLatencyDuration: 10,       // Target 10s from live edge
    liveDurationInfinity: false,

    // Fragment loading
    startFragPrefetch: true,
    maxFragLookUpTolerance: 0.2,

    // Network timeouts (strict for fast failover)
    manifestLoadingTimeOut: 5000,     // 5s manifest timeout
    manifestLoadingMaxRetry: 2,
    levelLoadingTimeOut: 5000,        // 5s level timeout
    levelLoadingMaxRetry: 2,
    fragLoadingTimeOut: 8000,         // 8s fragment timeout
    fragLoadingMaxRetry: 2,

    // Custom headers
    xhrSetup: xhr => {
      for (const [name, value] of Object.entries(headers)) {
        try {
          xhr.setRequestHeader(name, value);
        } catch {}
      }
    }
  };
}

/**
 * Get HLS.js configuration optimized for VOD (movies/series)
 */
export function getVodConfig(headers = {}) {
  return {
    enableWorker: false,
    startLevel: -1,
    capLevelToPlayerSize: true,
    testBandwidth: true,

    // Bandwidth estimation
    abrEwmaDefaultEstimate: 2000000,  // 2 Mbps starting estimate for VOD
    abrBandWidthFactor: 0.85,
    abrBandWidthUpFactor: 0.7,

    // Buffer configuration (optimized for VOD)
    maxBufferLength: 30,              // 30s forward buffer (was 60s)
    maxMaxBufferLength: 45,           // Max 45s buffer cap
    backBufferLength: 15,             // Keep 15s back buffer for seeking
    maxBufferHole: 0.3,

    // Fragment loading
    startFragPrefetch: true,
    maxFragLookUpTolerance: 0.25,

    // Network timeouts (more lenient for VOD)
    manifestLoadingTimeOut: 6000,
    manifestLoadingMaxRetry: 2,
    levelLoadingTimeOut: 6000,
    levelLoadingMaxRetry: 2,
    fragLoadingTimeOut: 8000,
    fragLoadingMaxRetry: 2,

    // No low-latency mode for VOD
    lowLatencyMode: false,

    // Custom headers
    xhrSetup: xhr => {
      for (const [name, value] of Object.entries(headers)) {
        try {
          xhr.setRequestHeader(name, value);
        } catch {}
      }
    }
  };
}

/**
 * Embed timeout configuration (5 seconds)
 */
export const EMBED_TIMEOUT_MS = 5000;

/**
 * Get error-specific failover strategy
 */
export function shouldFailover(errorData) {
  if (!errorData?.fatal) return false;

  // Network errors that should trigger failover
  const networkFailoverCodes = [403, 404, 410, 500, 502, 503, 504];

  if (errorData.response?.code && networkFailoverCodes.includes(errorData.response.code)) {
    return true;
  }

  // Fatal network or media errors after retries
  if (errorData.type === 'networkError' || errorData.type === 'mediaError') {
    return true;
  }

  return false;
}

/**
 * Enhanced error handler with auto-fallback
 */
export function createErrorHandler(hls, onFailover, retriesRef) {
  return (event, data) => {
    if (!data?.fatal) return;

    // Network error - try recovery
    if (data.type === hls.constructor.ErrorTypes.NETWORK_ERROR) {
      if (retriesRef.current < 2) {
        retriesRef.current += 1;
        hls.startLoad();
        return;
      }
      // Auto-failover on network errors
      if (shouldFailover(data)) {
        onFailover('Network error - switching to backup server');
        return;
      }
    }

    // Media error - try recovery
    if (data.type === hls.constructor.ErrorTypes.MEDIA_ERROR) {
      if (retriesRef.current < 2) {
        retriesRef.current += 1;
        hls.recoverMediaError();
        return;
      }
      onFailover('Media error - switching to backup server');
      return;
    }

    // Other fatal errors
    onFailover('Playback error encountered');
  };
}

/**
 * Check if URL is likely an embed (iframe-based)
 */
export function isEmbedUrl(url) {
  if (!url) return false;
  const embedPatterns = [
    'vidsrc.to',
    'vidsrc.icu',
    'multiembed.mov',
    'superembed.stream',
    'embed.su',
    'moviesapi.club',
    '/embed/',
    '/player/'
  ];
  return embedPatterns.some(pattern => url.toLowerCase().includes(pattern));
}

/**
 * Create embed timeout promise
 */
export function createEmbedTimeout(timeoutMs = EMBED_TIMEOUT_MS) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Embed loading timeout'));
    }, timeoutMs);
  });
}
