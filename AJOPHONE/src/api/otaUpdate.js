export const CURRENT_APP_VERSION = '2.4.8';
export const CURRENT_VERSION_CODE = 19;
const MANIFEST_URL = 'https://raw.githubusercontent.com/imakshayjoshi/ajo-releases/main/version.json';
const RELEASE_PREFIX = 'https://github.com/imakshayjoshi/ajo-releases/releases/download/';

export function compareVersions(a, b) {
  const left = String(a || '0').replace(/^v/, '').split('.').map(Number);
  const right = String(b || '0').replace(/^v/, '').split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return 1;
    if ((left[index] || 0) < (right[index] || 0)) return -1;
  }
  return 0;
}

export function isAllowedApkUrl(url) {
  return typeof url === 'string' && url.startsWith(RELEASE_PREFIX) && /\/AJO_(PHONE|TV)\.apk$/i.test(url);
}

export async function checkForAppUpdates(appType = 'phone') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(MANIFEST_URL + '?time=' + Date.now(), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    const target = manifest[appType] || {};
    const apkUrl = target.apk_url || '';
    const latestVersion = target.version || manifest.version || CURRENT_APP_VERSION;
    const latestCode = Number(target.versionCode || manifest.versionCode || CURRENT_VERSION_CODE);
    if (!isAllowedApkUrl(apkUrl)) throw new Error('Update URL was rejected');
    let installedVersion = CURRENT_APP_VERSION;
    let installedCode = CURRENT_VERSION_CODE;
    try { installedVersion = window.AndroidUpdater?.getAppVersionName?.() || installedVersion; installedCode = Number(window.AndroidUpdater?.getAppVersionCode?.()) || installedCode; } catch {}
    return { hasUpdate: latestCode > installedCode || compareVersions(latestVersion, installedVersion) > 0, latestVersion, currentVersion: installedVersion, changelog: Array.isArray(target.changelog) ? target.changelog : [], apkUrl, size: target.size_mb || '', releaseDate: manifest.releaseDate || '' };
  } catch { return { hasUpdate: false, latestVersion: CURRENT_APP_VERSION, currentVersion: CURRENT_APP_VERSION, changelog: [], apkUrl: '', size: '', releaseDate: '' }; }
  finally { clearTimeout(timer); }
}

export function startAppUpdate(apkUrl, onProgress, onStatus, onError) {
  if (!isAllowedApkUrl(apkUrl)) { onError?.('Update URL was rejected.'); return false; }
  window.onAJOUpdateProgress = onProgress || (() => {});
  window.onAJOUpdateStatus = onStatus || (() => {});
  window.onAJOUpdateError = onError || (() => {});
  try { if (window.AndroidUpdater?.downloadAndInstall) { window.AndroidUpdater.downloadAndInstall(apkUrl); return true; } } catch (error) { onError?.(error.message); }
  window.open(apkUrl, '_blank', 'noopener,noreferrer');
  onStatus?.('BROWSER_DOWNLOAD_OPENED', 100);
  return false;
}
