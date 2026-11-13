import React, { useState, useEffect } from 'react';
import { isAllowedApkUrl } from '../api/otaUpdate';

/**
 * v3.17.52: OTA banner as its own component. Previously downloadProgress lived
 * in App state, so every native percent tick re-rendered the ENTIRE app tree —
 * header, all home rails, player, modals. Now the banner owns its progress
 * state; App re-renders only when the prompt appears/disappears.
 *
 * The downloading flag is exposed via window.__ajoOtaDownloading so App's
 * update-check guard can read it without state coupling.
 */
export function OtaBanner({ otaPrompt, onDismiss }) {
  const [downloadProgress, setDownloadProgress] = useState(null);

  useEffect(() => {
    window.onAJOUpdateProgress = (percent) => {
      window.__ajoOtaDownloading = true;
      setDownloadProgress({ percent });
    };
    window.onAJOUpdateStatus = (status) => {
      if (status === 'READY_TO_INSTALL') {
        setDownloadProgress({ percent: 100, ready: true });
      }
    };
    window.onAJOUpdateError = () => {
      window.__ajoOtaDownloading = false;
      setDownloadProgress(null);
    };
    return () => {
      window.onAJOUpdateProgress = null;
      window.onAJOUpdateStatus = null;
      window.onAJOUpdateError = null;
      window.__ajoOtaDownloading = false;
    };
  }, []);

  useEffect(() => {
    if (!downloadProgress) window.__ajoOtaDownloading = false;
  }, [downloadProgress]);

  if (!otaPrompt) return null;

  return (
    <div className="tv-ota-rail tv-rail" style={{
      background: otaPrompt.needsReinstall
        ? 'linear-gradient(90deg, #b45309, #f59e0b)'
        : 'linear-gradient(90deg, #2563eb, #38bdf8)',
      color: '#ffffff',
      padding: '10px 48px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontWeight: 700,
      fontSize: '0.95rem'
    }}>
      <span>
        {downloadProgress
          ? (downloadProgress.ready ? '⚡ Update downloaded! Launching installer...' : `📥 Downloading: ${downloadProgress.percent || 0}%`)
          : (otaPrompt.isPhoneSwitch
            ? `📱 Phone detected! Tap to install the touch-friendly AJO Phone app (v${otaPrompt.latestVersion})`
            : (otaPrompt.needsReinstall
              ? '⚠ AJO is switching to its permanent release key — this update needs a quick one-time reinstall.'
              : `🚀 Update Available: v${otaPrompt.currentVersion || '?'} → v${otaPrompt.latestVersion} (Android TV Edition)`))}
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        {!downloadProgress && (
          <button
            tabIndex={0}
            className="tv-btn-primary"
            style={{ padding: '6px 16px', fontSize: '0.85rem' }}
            onClick={() => {
              // v3.17.51: validate at the point of use.
              if (!isAllowedApkUrl(otaPrompt.apkUrl)) {
                onDismiss();
                return;
              }
              window.__ajoOtaDownloading = true;
              setDownloadProgress({ percent: 0 });
              if (window.AndroidUpdater?.downloadAndInstall) {
                window.AndroidUpdater.downloadAndInstall(otaPrompt.apkUrl);
              } else {
                window.open(otaPrompt.apkUrl, '_blank');
              }
            }}
          >
            {otaPrompt.isPhoneSwitch ? 'Install Phone App' : (otaPrompt.needsReinstall ? 'One-Time Reinstall' : 'Update Now')}
          </button>
        )}
        <button
          tabIndex={0}
          className="tv-btn-secondary"
          style={{ padding: '6px 16px', fontSize: '0.85rem' }}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
