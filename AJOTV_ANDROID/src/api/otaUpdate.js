export const CURRENT_APP_VERSION = '3.17.56';
export const CURRENT_VERSION_CODE = 313;
const MANIFEST_SOURCES = [
  'https://raw.githubusercontent.com/imakshayjoshi/ajo-releases/main/version.json',
  'https://cdn.jsdelivr.net/gh/imakshayjoshi/ajo-releases@main/version.json',
  'https://api.github.com/repos/imakshayjoshi/ajo-releases/releases/latest'
  // REMOVED raw.githack.com (v3.12.92): it caches forever with no purge path
  // and serves stale manifests, short-circuiting the source loop — devices on
  // networks where raw.github fails never saw update banners.
];
const RELEASE_PREFIX = 'https://github.com/imakshayjoshi/ajo-releases/releases/download/';

// v3.17.53: per-appType target table. The release repo ships one APK per
// package, and each key maps to a DIFFERENT package (fire_tv is com.ajo.tv,
// not com.ajo.androidtv). The old ternaries collapsed fire_tv into the phone
// branch, so a Fire TV device would download the phone APK and fail to install
// (INSTALL_FAILED_UPDATE_INCOMPATIBLE). This table is the single source of
// truth for both the manifest keys and the GitHub-API asset fallback.
export const APP_TARGETS = {
  tv:         { packageId: 'com.ajo.androidtv', assetName: 'AJO_TV.apk' },
  android_tv: { packageId: 'com.ajo.androidtv', assetName: 'AJO_ANDROID_TV.apk' },
  fire_tv:    { packageId: 'com.ajo.tv',        assetName: 'AJO_TV_FIRE.apk' },
  phone:      { packageId: 'com.ajo.phone',     assetName: 'AJO_PHONE.apk' },
};

export function extractVersion(tagOrVersion) {
  const match = String(tagOrVersion || '').match(/\d+(?:\.\d+)+/);
  return match ? match[0] : String(tagOrVersion || '0').replace(/^[^\d]*/, '').split(/[-+]/)[0];
}

export function compareVersions(a, b) {
  const cleanA = extractVersion(a);
  const cleanB = extractVersion(b);
  const left = cleanA.split('.').map(Number);
  const right = cleanB.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return 1;
    if ((left[index] || 0) < (right[index] || 0)) return -1;
  }
  return 0;
}

// v3.17.51: strict host validation. The old `url.includes('github.com')` check
// passed for `github.com.evil.com/AJO_TV.apk` — a poisoned manifest could have
// pointed the installer anywhere. Parse the URL and whitelist exact hosts.
const OTA_TRUSTED_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com', // release-asset redirect target
  'cdn.jsdelivr.net',
  'api.github.com',
]);

export function isAllowedApkUrl(url) {
  if (typeof url !== 'string') return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!OTA_TRUSTED_HOSTS.has(host)) return false;
  // Must be OUR repo path AND our APK name — no bare endsWith('.apk').
  const path = u.pathname;
  const isAjoApk = /\/AJO_[A-Z_]+\.apk$/i.test(path);
  if (!isAjoApk) return false;
  if (host === 'objects.githubusercontent.com') return true; // signed redirect, path is opaque
  if (host === 'cdn.jsdelivr.net') return path.startsWith('/gh/imakshayjoshi/ajo-releases');
  return path.startsWith('/imakshayjoshi/ajo-releases/');
}

export async function checkForAppUpdates(appType = 'tv') {
  let manifestData = null;
  let fromGithubApi = false;
  let highestVersion = '0.0.0';
  let highestCode = 0;

  for (const sourceUrl of MANIFEST_SOURCES) {
    try {
      // v3.13.0 FIX (restore of the v3.12.53 CORS rule, lost in the 3.12.74+ line):
      // custom headers like Cache-Control / Pragma are NOT CORS-safelisted on
      // old Fire OS WebViews, so every manifest fetch triggered a preflight
      // that raw.githubusercontent / jsdelivr / api.github all reject — every
      // source failed silently and the app always said "no update". The ?t=
      // buster plus fetch cache mode handle freshness without any headers.
      // AbortController is also feature-detected: pre-Chromium-66 Fire OS 5
      // WebViews throw on it and would kill every source the same way.
      const supportsAbort = typeof AbortController !== 'undefined';
      const controller = supportsAbort ? new AbortController() : null;
      const timer = supportsAbort ? setTimeout(() => controller.abort(), 3500) : null;
      const url = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
      const response = await fetch(url, {
        cache: 'no-cache',
        ...(supportsAbort ? { signal: controller.signal } : {})
      });
      if (timer) clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        if (data && data.assets && data.tag_name) {
          const v = extractVersion(data.tag_name);
          // v3.17.53: the GitHub release tag is the TV version series
          // (e.g. v3.17.53). A phone app (3.9.x) must NEVER adopt a TV tag —
          // the old code let the phone fall into the GH-API branch and then
          // picked the first asset containing "TV", i.e. a TV APK. Guard on
          // the major.minor series so only the matching family accepts it.
          const seriesPrefix = String(CURRENT_APP_VERSION).split('.').slice(0, 2).join('.');
          if (!extractVersion(data.tag_name).startsWith(seriesPrefix)) {
            continue;
          }
          // v3.12.43: strict > — an older release from a later-queried source
          // must never override a newer version.json result.
          if (compareVersions(v, highestVersion) > 0) {
            highestVersion = v;
            manifestData = data;
            fromGithubApi = true;
          }
        } else if (data) {
          const target = data[appType] || {};
          const v = extractVersion(target.version || data.version || '0.0.0');
          const code = Number(target.versionCode || data.versionCode || 0);
          if (compareVersions(v, highestVersion) > 0 || (compareVersions(v, highestVersion) === 0 && code >= highestCode)) {
            highestVersion = v;
            highestCode = code;
            manifestData = data;
            fromGithubApi = false;
          }
        }
      }
    } catch {
      // Failover to next CDN/API source
    }
  }

  try {
    const target = APP_TARGETS[appType] || APP_TARGETS.tv;
    let targetEntry = {};
    let latestVersion = highestVersion !== '0.0.0' ? highestVersion : CURRENT_APP_VERSION;
    let apkUrl = '';
    let changelog = [];
    let size = '6.9 MB';
    let releaseDate = new Date().toISOString().split('T')[0];
    const packageId = target.packageId;

    const directApkUrl = `https://raw.githubusercontent.com/imakshayjoshi/ajo-releases/main/${target.assetName}`;

    if (fromGithubApi && manifestData) {
      latestVersion = extractVersion(manifestData.tag_name || CURRENT_APP_VERSION);
      if (Array.isArray(manifestData.assets)) {
        // v3.17.53: exact asset-name match per appType. The old
        // `includes('TV')` grabbed AJO_TV.apk (an Android-TV package) for the
        // phone and for fire_tv — never the right binary.
        const apkAsset = manifestData.assets.find(a => (a.name || '') === target.assetName);
        if (apkAsset?.browser_download_url) {
          apkUrl = apkAsset.browser_download_url;
        }
      }
      if (!apkUrl) apkUrl = directApkUrl;
      changelog = manifestData.body ? manifestData.body.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*')).map(l => l.replace(/^[-*]\s*/, '').trim()) : [];
      releaseDate = manifestData.published_at ? manifestData.published_at.split('T')[0] : releaseDate;
    } else if (manifestData && manifestData[appType]) {
      targetEntry = manifestData[appType] || {};
      latestVersion = extractVersion(targetEntry.version || manifestData.version || CURRENT_APP_VERSION);
      apkUrl = targetEntry.apkUrl || targetEntry.apk_url || directApkUrl;
      changelog = Array.isArray(targetEntry.changelog) ? targetEntry.changelog : [];
      size = targetEntry.size_mb || targetEntry.size || size;
      releaseDate = manifestData.releaseDate || releaseDate;
    }

    if (!apkUrl) {
      apkUrl = directApkUrl;
    }

    // v3.17.47: robust installed-version detection. The native bridge is the
    // source of truth; if it is missing (web preview / stale bridge) we fall
    // back to the compiled constant. A null/empty bridge value must NEVER be
    // treated as an old version (that caused a permanent false update banner).
    let installedVersion = CURRENT_APP_VERSION;
    let installedCode = CURRENT_VERSION_CODE;
    let bridgeAvailable = false;
    try {
      if (window.AndroidUpdater && typeof window.AndroidUpdater.getAppVersionName === 'function') {
        const v = window.AndroidUpdater.getAppVersionName();
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          installedVersion = String(v);
          bridgeAvailable = true;
        }
      }
      if (window.AndroidUpdater && typeof window.AndroidUpdater.getAppVersionCode === 'function') {
        const c = Number(window.AndroidUpdater.getAppVersionCode());
        if (Number.isFinite(c) && c > 0) {
          installedCode = c;
          bridgeAvailable = true;
        }
      }
    } catch {}

    const cleanLatest = String(latestVersion || '').trim().replace(/^v/, '');
    const cleanInstalled = String(installedVersion || '').trim().replace(/^v/, '');
    const targetCode = Number(targetEntry.versionCode || (manifestData && manifestData.versionCode) || 0);

    // v3.17.47: strict comparison. Only show the banner when the target is
    // STRICTLY newer than what is installed. Equal versions never prompt.
    let hasUpdate = false;
    if (targetCode > 0 && installedCode > 0) {
      hasUpdate = targetCode > installedCode;
    } else if (cleanInstalled && cleanInstalled !== '0') {
      hasUpdate = compareVersions(cleanLatest, cleanInstalled) > 0;
    } else {
      hasUpdate = false; // unknown install -> do not nag
    }

    return {
      hasUpdate,
      latestVersion: cleanLatest,
      currentVersion: cleanInstalled,
      installedCode,
      targetCode,
      bridgeAvailable,
      changelog,
      apkUrl,
      size,
      releaseDate,
      packageId,
      sha256: targetEntry.sha256 || null,
      // v3.2.0 keystore cutover: manifest declares which key signs new builds.
      // Debug-signed installs must NOT update in place to release-signed APKs
      // (INSTALL_FAILED_UPDATE_INCOMPATIBLE) — UI routes them to a guided
      // one-time reinstall instead.
      targetSigning: String(targetEntry.signing || manifestData.signing || 'debug'),
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
