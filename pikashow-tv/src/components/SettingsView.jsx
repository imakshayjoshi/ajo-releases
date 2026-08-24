import React, { useState, useEffect } from 'react';
import { RefreshCw, Trash2, ShieldCheck, Download, Tv, Info, CheckCircle2, AlertCircle, Puzzle, Plus } from 'lucide-react';
import { checkForAppUpdates, CURRENT_APP_VERSION } from '../api/otaUpdate';
import { getInstalledAddons, installAddon, removeAddon, FEATURED_ADDONS } from '../api/stremio';

export function SettingsView() {
  const [updateStatus, setUpdateStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [addons, setAddons] = useState([]);
  const [addonUrl, setAddonUrl] = useState('');
  const [addonStatus, setAddonStatus] = useState(null);

  const refreshAddons = () => setAddons(getInstalledAddons());
  useEffect(() => { refreshAddons(); }, []);

  const handleInstallAddon = async (url) => {
    setAddonStatus({ type: 'loading', msg: 'Installing...' });
    try {
      const addon = await installAddon(url || addonUrl);
      setAddonUrl('');
      refreshAddons();
      setAddonStatus({ type: 'ok', msg: `${addon.name} installed!` });
      setTimeout(() => setAddonStatus(null), 3000);
    } catch (e) {
      setAddonStatus({ type: 'err', msg: e.message });
      setTimeout(() => setAddonStatus(null), 4000);
    }
  };

  const handleRemoveAddon = (id) => {
    removeAddon(id);
    refreshAddons();
  };

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
      // v3.8.0 keystore cutover: debug-signed installs can't update in place
      // to a release-signed APK — show the one-time reinstall path instead.
      if (result.targetSigning === 'release' && !result.isReleaseSigned) {
        result.needsReinstall = true;
      }
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
          <Puzzle size={20} style={{ display: 'inline', marginRight: 8 }} />
          Addons (Stremio Compatible)
        </h2>
        <p className="tv-settings-desc">
          Install community addons for unlimited catalogs and streams. Paste any Stremio addon URL.
        </p>

        {/* Featured one-tap addons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {FEATURED_ADDONS.map(fa => {
            const installed = addons.some(a => a.id === fa.id);
            return (
              <button
                key={fa.id}
                tabIndex={0}
                className="tv-btn-secondary"
                onClick={() => handleInstallAddon(fa.url)}
                disabled={installed}
                style={{ padding: '8px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {installed ? <CheckCircle2 size={14} color="#22c55e" /> : <Plus size={14} />}
                {installed ? fa.name : `Add ${fa.name}`}
              </button>
            );
          })}
        </div>

        {/* Custom URL input */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            tabIndex={0}
            value={addonUrl}
            onChange={(e) => setAddonUrl(e.target.value)}
            placeholder="https://addon.example.com/manifest.json"
            style={{
              flex: 1, minWidth: 260, padding: '10px 12px',
              background: 'rgba(15,20,31,0.9)', border: '1px solid rgba(148,163,184,0.3)',
              borderRadius: 8, color: '#fff', fontSize: '0.9rem'
            }}
          />
          <button tabIndex={0} className="tv-btn-primary" onClick={() => handleInstallAddon()} disabled={!addonUrl}>
            <Plus size={16} /> Install
          </button>
        </div>

        {addonStatus && (
          <p style={{ marginTop: 10, fontWeight: 700, color: addonStatus.type === 'ok' ? '#22c55e' : addonStatus.type === 'err' ? '#ef4444' : '#38bdf8' }}>
            {addonStatus.msg}
          </p>
        )}

        {/* Installed list */}
        {addons.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong style={{ color: '#94a3b8', fontSize: '0.85rem' }}>INSTALLED ({addons.length}):</strong>
            {addons.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>{a.name} <span style={{ color: '#64748b', fontSize: '0.8rem' }}>v{a.version}</span></span>
                <button tabIndex={0} className="tv-btn-secondary" onClick={() => handleRemoveAddon(a.id)} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
                <p style={{ color: updateStatus.needsReinstall ? '#f59e0b' : '#38bdf8', fontWeight: 700, marginBottom: 6 }}>
                  {updateStatus.needsReinstall
                    ? '⚠ AJO is switching to its permanent release key. This one-time reinstall keeps your app updatable forever — your data and watch history are preserved.'
                    : `🚀 New Update Available: v${updateStatus.latestVersion}`}
                </p>
                <button
                  tabIndex={0}
                  className="tv-btn-primary"
                  onClick={() => handleInstallUpdate(updateStatus.apkUrl)}
                  style={{ background: updateStatus.needsReinstall ? '#f59e0b' : '#22c55e', marginTop: 6 }}
                >
                  <Download size={16} />
                  <span>{updateStatus.needsReinstall ? 'One-Time Reinstall' : 'Download & Install Now'}</span>
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
