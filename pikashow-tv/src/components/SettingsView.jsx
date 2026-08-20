import React, { useState, useEffect } from 'react';
import { RefreshCw, Trash2, ShieldCheck, Download, Tv, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { checkForAppUpdates, CURRENT_APP_VERSION } from '../api/otaUpdate';

export function SettingsView() {
  const [updateStatus, setUpdateStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    window.onAJOUpdateProgress = (percent, total, totalLength) => {
      setDownloadProgress({ percent, total, totalLength });
    };
    window.onAJOUpdateStatus = (status) => {
      if (status === 'READY_TO_INSTALL') {
        setDownloadProgress({ percent: 100, ready: true });
      }
    };
    window.onAJOUpdateError = (err) => {
      setDownloadError(err);
      setDownloadProgress(null);
    };
    return () => {
      window.onAJOUpdateProgress = null;
      window.onAJOUpdateStatus = null;
      window.onAJOUpdateError = null;
    };
  }, []);

  const handleCheckUpdate = async () => {
    setIsChecking(true);
    setUpdateStatus(null);
    setDownloadProgress(null);
    setDownloadError(null);
    try {
      const result = await checkForAppUpdates('tv');
      setUpdateStatus(result);
    } catch (err) {
      setUpdateStatus({ hasUpdate: false, error: 'Could not connect to update servers.' });
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstallUpdate = (apkUrl) => {
    if (!apkUrl) return;
    setDownloadError(null);
    setDownloadProgress({ percent: 0, total: 0, totalLength: 0 });
    if (window.AndroidUpdater && window.AndroidUpdater.downloadAndInstall) {
      window.AndroidUpdater.downloadAndInstall(apkUrl);
    } else {
      window.open(apkUrl, '_blank');
    }
  };

  const handleClearCache = () => {
    try {
      localStorage.clear();
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    } catch (_) {}
  };

  return (
    <div className="tv-settings-grid">
      {/* App Version & OTA Update Card */}
      <div className="tv-settings-card">
        <h2 className="tv-settings-title">
          <RefreshCw size={20} style={{ display: 'inline', marginRight: 8 }} />
          Software Updates
        </h2>
        <p className="tv-settings-desc">
          Current Installed Version: <strong>v{CURRENT_APP_VERSION} (Fire TV Edition)</strong>
        </p>

        <button
          tabIndex={0}
          className="tv-btn-primary"
          onClick={handleCheckUpdate}
          disabled={isChecking || Boolean(downloadProgress)}
          style={{ width: 'fit-content', marginTop: 8 }}
        >
          {isChecking ? <RefreshCw className="tv-spinner" size={16} /> : <Download size={16} />}
          <span>{isChecking ? 'Checking for updates...' : 'Check for Updates'}</span>
        </button>

        {downloadProgress && (
          <div style={{ marginTop: 14, padding: 14, background: 'rgba(15, 20, 31, 0.9)', borderRadius: 8, border: '1px solid #38bdf8' }}>
            <p style={{ color: '#38bdf8', fontWeight: 700, marginBottom: 8 }}>
              {downloadProgress.ready
                ? '⚡ Update downloaded! Launching installer...'
                : `📥 Downloading Update: ${downloadProgress.percent || 0}%`}
            </p>
            <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${downloadProgress.percent || 0}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #22c55e)',
                transition: 'width 0.2s linear'
              }} />
            </div>
          </div>
        )}

        {downloadError && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(239, 68, 68, 0.2)', borderRadius: 8, border: '1px solid #ef4444' }}>
            <p style={{ color: '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={16} />
              Update Failed: {String(downloadError)}
            </p>
          </div>
        )}

        {updateStatus && !downloadProgress && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(15, 20, 31, 0.8)', borderRadius: 8 }}>
            {updateStatus.hasUpdate ? (
              <div>
                <p style={{ color: '#38bdf8', fontWeight: 700, marginBottom: 6 }}>
                  🚀 New Update Available: v{updateStatus.latestVersion}
                </p>
                <button
                  tabIndex={0}
                  className="tv-btn-primary"
                  onClick={() => handleInstallUpdate(updateStatus.apkUrl)}
                  style={{ background: '#22c55e', marginTop: 6 }}
                >
                  <Download size={16} />
                  <span>Download & Install Now</span>
                </button>
              </div>
            ) : (
              <p style={{ color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} />
                You are on the latest version (v{CURRENT_APP_VERSION}).
              </p>
            )}
          </div>
        )}
      </div>

      {/* Storage & Memory Cache Card */}
      <div className="tv-settings-card">
        <h2 className="tv-settings-title">
          <Trash2 size={20} style={{ display: 'inline', marginRight: 8 }} />
          Storage & RAM Optimization
        </h2>
        <p className="tv-settings-desc">
          Clear temporary metadata cache, playlists, and history to free up memory on 1GB RAM Fire TV devices.
        </p>

        <button
          tabIndex={0}
          className="tv-btn-secondary"
          onClick={handleClearCache}
          style={{ width: 'fit-content', marginTop: 8 }}
        >
          <span>Clear Cache & Reset Memory</span>
        </button>

        {cacheCleared && (
          <p style={{ color: '#22c55e', fontWeight: 600, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={16} />
            Memory cache cleared successfully!
          </p>
        )}
      </div>

      {/* Device & Playback Engine Diagnostics */}
      <div className="tv-settings-card">
        <h2 className="tv-settings-title">
          <Tv size={20} style={{ display: 'inline', marginRight: 8 }} />
          Playback Engine Status
        </h2>
        <div style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <p>• <strong>Video Pipeline:</strong> Hardware Direct SurfaceView (Z-MediaOverlay)</p>
          <p>• <strong>Decoder Fallback:</strong> Automatic H.264/H.265 Hardware to Software</p>
          <p>• <strong>Buffer Optimization:</strong> Ultra-Low Latency Live Buffer (30+ Mbps Optimized)</p>
          <p>• <strong>Target Architecture:</strong> Fire OS 5/6/7 / Android TV 5.1+</p>
        </div>
      </div>
    </div>
  );
}
