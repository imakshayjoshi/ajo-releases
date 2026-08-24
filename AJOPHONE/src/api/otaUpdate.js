export const CURRENT_APP_VERSION = '3.3.9';
export const CURRENT_VERSION_CODE = 58;
const MANIFEST_SOURCES = [
  'https://raw.githubusercontent.com/imakshayjoshi/ajo-releases/main/version.json',
  'https://cdn.jsdelivr.net/gh/imakshayjoshi/ajo-releases@main/version.json',
  'https://api.github.com/repos/imakshayjoshi/ajo-releases/releases/latest'
];
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
  if (typeof url !== 'string') return false;
  const isAjoApk = /\/AJO_(PHONE|TV)\.apk(\?.*)?$/i.test(url) || url.endsWith('.apk');
  const isTrustedHost = url.includes('github.com') || 
                        url.includes('raw.githubusercontent.com') || 
                        url.includes('jsdelivr.net') || 
                        url.includes('tinyurl.com');
  return isAjoApk && isTrustedHost;
}

export async function checkForAppUpdates(appType = 'tv') {
  let manifestData = null;
  let fromGithubApi = false;

  for (const sourceUrl of MANIFEST_SOURCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(sourceUrl + (sourceUrl.includes('api.github') ? '' : '?time=' + Date.now()), {
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (response.ok) {
        manifestData = await response.json();
        if (manifestData.assets) fromGithubApi = true;
        break;
      }
    } catch {
      // Failover to next CDN/API source
    }
  }

  try {
    let target = {};
    let latestVersion = CURRENT_APP_VERSION;
    let apkUrl = '';
    let changelog = [];
    let size = '4.3 MB';
    let releaseDate = new Date().toISOString().split('T')[0];
    const packageId = appType === 'tv' ? 'com.ajo.tv' : 'com.ajo.phone';

    if (fromGithubApi && manifestData) {
      latestVersion = String(manifestData.tag_name || CURRENT_APP_VERSION).replace(/^v/, '');
      const assetTargetName = appType === 'tv' ? 'AJO_TV.apk' : 'AJO_PHONE.apk';
      const foundAsset = (manifestData.assets || []).find(a => (a.name || '').toLowerCase() === assetTargetName.toLowerCase());
      apkUrl = foundAsset?.browser_download_url || `${RELEASE_PREFIX}v${latestVersion}/${assetTargetName}`;
      changelog = manifestData.body ? manifestData.body.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*')).map(l => l.replace(/^[-*]\s*/, '').trim()) : [];
      releaseDate = manifestData.published_at ? manifestData.published_at.split('T')[0] : releaseDate;
    } else if (manifestData && manifestData[appType]) {
      target = manifestData[appType] || {};
      latestVersion = target.version || manifestData.version || CURRENT_APP_VERSION;
      apkUrl = target.apkUrl || target.apk_url || '';
      changelog = Array.isArray(target.changelog) ? target.changelog : [];
      size = target.size_mb || target.size || size;
      releaseDate = manifestData.releaseDate || releaseDate;
    }

    if (!apkUrl) {
      apkUrl = `${RELEASE_PREFIX}v${latestVersion}/${appType === 'tv' ? 'AJO_TV.apk' : 'AJO_PHONE.apk'}`;
    }

    let installedVersion = CURRENT_APP_VERSION;
    let installedCode = CURRENT_VERSION_CODE;
    try {
      if (window.AndroidUpdater?.getAppVersionName) {
        installedVersion = window.AndroidUpdater.getAppVersionName();
      }
      if (window.AndroidUpdater?.getAppVersionCode) {
        installedCode = Number(window.AndroidUpdater.getAppVersionCode()) || CURRENT_VERSION_CODE;
      }
    } catch {}

    const cleanLatest = String(latestVersion || '').trim().replace(/^v/, '');
    const cleanInstalled = String(installedVersion || '').trim().replace(/^v/, '');
    const targetCode = Number(target.versionCode || manifestData.versionCode || 0);

    let hasUpdate = false;
    if (targetCode > 0 && installedCode > 0) {
      hasUpdate = targetCode > installedCode;
    } else {
      hasUpdate = compareVersions(cleanLatest, cleanInstalled) > 0;
    }

    return {
      hasUpdate,
      latestVersion: cleanLatest,
      currentVersion: cleanInstalled,
      changelog,
      apkUrl,
      size,
      releaseDate,
      packageId,
      sha256: target.sha256 || null,
      // v3.2.0 keystore cutover: manifest declares which key signs new builds.
      // Debug-signed installs must NOT update in place to release-signed APKs
      // (INSTALL_FAILED_UPDATE_INCOMPATIBLE) — UI routes them to a guided
      // one-time reinstall instead.
      targetSigning: String(target.signing || manifestData.signing || 'debug'),
      isReleaseSigned: (() => {
        try { return window.AndroidUpdater?.isReleaseSigned?.() === true; } catch { return false; }
      })()
    };
  } catch {
    return {
      hasUpdate: false,
      latestVersion: CURRENT_APP_VERSION,
      currentVersion: CURRENT_APP_VERSION,
      changelog: [],
      apkUrl: '',
      size: '',
      releaseDate: ''
    };
  }
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
