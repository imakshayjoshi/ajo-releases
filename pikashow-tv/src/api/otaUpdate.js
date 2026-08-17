/**
 * AJO Over-The-Air (OTA) Software Update Engine
 * Ultra-Fast, Dual-Source Instant Version Checker & 1-Tap APK Installer.
 */

export const CURRENT_APP_VERSION = '2.4.8';
export const CURRENT_VERSION_CODE = 19;

// Primary & Secondary Manifest Endpoints for zero-delay cache bypass
export const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/imakshayjoshi/ajo-releases/main/version.json';
export const GITHUB_API_LATEST_URL = 'https://api.github.com/repos/imakshayjoshi/ajo-releases/releases/latest';

/**
 * Compare two semver strings (e.g., '2.4.0' vs '2.4.1')
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1, v2) {
  const parts1 = (v1 || '0').replace(/^v/, '').split('.').map(Number);
  const parts2 = (v2 || '0').replace(/^v/, '').split('.').map(Number);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

let cachedUpdateCheck = null;
let lastCheckTimestamp = 0;

/**
 * Ultra-Fast Parallel OTA Update Checker
 * @param {'phone'|'tv'} appType
 * @returns {Promise<{ hasUpdate: boolean, latestVersion: string, currentVersion: string, changelog: string[], apkUrl: string, size: string, releaseDate: string }>}
 */
export async function checkForAppUpdates(appType = 'phone', force = false) {
  const now = Date.now();
  if (!force && cachedUpdateCheck && (now - lastCheckTimestamp < 30000)) {
    return cachedUpdateCheck;
  }

  let latestVersion = CURRENT_APP_VERSION;
  let latestCode = CURRENT_VERSION_CODE;
  let changelog = [
    '⚡ Performance boost and faster launch speeds',
    '📺 Complete Live TV and VOD stream enhancements'
  ];
  let apkUrl = `https://github.com/imakshayjoshi/ajo-releases/releases/latest/download/AJO_${appType === 'tv' ? 'TV' : 'PHONE'}.apk`;
  let sizeMb = '4.6 MB';
  let releaseDate = new Date().toISOString().split('T')[0];

  // Fetch from raw manifest and GitHub API in parallel with timeout
  const fetchManifest = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(`${UPDATE_MANIFEST_URL}?_t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    clearTimeout(timer);
    return null;
  };

  const fetchGithubApi = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(GITHUB_API_LATEST_URL, {
        signal: controller.signal,
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    clearTimeout(timer);
    return null;
  };

  const [manifestRes, ghRes] = await Promise.allSettled([fetchManifest(), fetchGithubApi()]);

  if (manifestRes.status === 'fulfilled' && manifestRes.value) {
    const m = manifestRes.value;
    const target = m[appType] || m.phone || {};
    latestVersion = target.version || m.version || latestVersion;
    latestCode = target.versionCode || m.versionCode || latestCode;
    changelog = target.changelog || changelog;
    apkUrl = target.apk_url || apkUrl;
    sizeMb = target.size_mb || sizeMb;
    releaseDate = m.releaseDate || releaseDate;
  } else if (ghRes.status === 'fulfilled' && ghRes.value) {
    const gh = ghRes.value;
    const tagName = (gh.tag_name || '').replace(/^v/, '');
    if (tagName) {
      latestVersion = tagName;
    }
    const asset = (gh.assets || []).find(a => a.name === (appType === 'tv' ? 'AJO_TV.apk' : 'AJO_PHONE.apk'));
    if (asset && asset.browser_download_url) {
      apkUrl = asset.browser_download_url;
      if (asset.size) {
        sizeMb = `${(asset.size / (1024 * 1024)).toFixed(1)} MB`;
      }
    }
    if (gh.body) {
      changelog = gh.body.split('\n').filter(l => l.trim().length > 0).slice(0, 5);
    }
  }

  let installedVersion = CURRENT_APP_VERSION;
  let installedCode = CURRENT_VERSION_CODE;

  if (typeof window !== 'undefined' && window.AndroidUpdater) {
    try {
      if (window.AndroidUpdater.getAppVersionName) {
        installedVersion = window.AndroidUpdater.getAppVersionName();
      }
      if (window.AndroidUpdater.getAppVersionCode) {
        installedCode = Number(window.AndroidUpdater.getAppVersionCode()) || installedCode;
      }
    } catch (_) {}
  }

  const isNewer = (latestCode > installedCode) || (compareVersions(latestVersion, installedVersion) > 0);

  const result = {
    hasUpdate: isNewer,
    latestVersion: latestVersion,
    currentVersion: installedVersion,
    changelog: changelog,
    apkUrl: apkUrl,
    size: sizeMb,
    releaseDate: releaseDate
  };

  cachedUpdateCheck = result;
  lastCheckTimestamp = Date.now();
  return result;
}

/**
 * Start OTA download and installation
 * @param {string} apkUrl
 * @param {Function} onProgress (progress, downloadedBytes, totalBytes) => {}
 * @param {Function} onStatus (status, progress) => {}
 * @param {Function} onError (errMessage) => {}
 */
export function startAppUpdate(apkUrl, onProgress, onStatus, onError) {
  if (typeof window === 'undefined') return false;

  window.onAJOUpdateProgress = (progress, downloaded, total) => {
    if (onProgress) onProgress(progress, downloaded, total);
  };

  window.onAJOUpdateStatus = (status, progress) => {
    if (onStatus) onStatus(status, progress);
  };

  window.onAJOUpdateError = (errMsg) => {
    if (onError) onError(errMsg);
  };

  if (window.AndroidUpdater && window.AndroidUpdater.downloadAndInstall) {
    try {
      window.AndroidUpdater.downloadAndInstall(apkUrl);
      return true;
    } catch (e) {
      console.warn('[OTA] Native installer call failed, falling back to browser:', e);
    }
  }

  // Fallback: direct browser/Capacitor download
  if (apkUrl) {
    const a = document.createElement('a');
    a.href = apkUrl;
    a.download = apkUrl.substring(apkUrl.lastIndexOf('/') + 1) || 'AJO_UPDATE.apk';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 500);
  }
  if (onStatus) onStatus('BROWSER_DOWNLOAD_OPENED', 100);
  return false;
}
