import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Trash2, 
  Moon, 
  Tv, 
  ShieldCheck, 
  HardDrive, 
  Check, 
  RefreshCw,
  Server,
  Info,
  Sparkles,
  Download,
  ArrowUpCircle,
  Loader2,
  AlertCircle,
  Puzzle,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { clearWatchHistory, clearAppCache, setSleepTimer as applySleepTimer } from '../api/history';
import { getIPTVConfig, saveIPTVConfig } from '../api/iptv';
import { getInstalledAddons, installAddon, removeAddon, FEATURED_ADDONS } from '../api/stremio';
import { checkForAppUpdates, startAppUpdate, CURRENT_APP_VERSION } from '../api/otaUpdate';

export function SettingsView({ onClearHistory, onReloadApp }) {
  const currentConfig = getIPTVConfig();
  let __addonsInit = [];
try { __addonsInit = getInstalledAddons() || []; } catch {}
const [addons, setAddons] = useState(__addonsInit);
  const [addonUrl, setAddonUrl] = useState('');
  const [addonStatus, setAddonStatus] = useState(null);

  const refreshAddons = () => setAddons(getInstalledAddons());

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
  const [jioTvHost, setJioTvHost] = useState(currentConfig.jioTvHost);
  const [customM3uUrl, setCustomM3uUrl] = useState(currentConfig.customM3uUrl);
  const [sleepTimer, setSleepTimer] = useState('off');
  const [actionNotice, setActionNotice] = useState(null);

  // OTA Update State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStats, setDownloadStats] = useState({ downloaded: 0, total: 0 });
  const [updateStatusText, setUpdateStatusText] = useState('');
  const [updateError, setUpdateError] = useState(null);

  const playlistPresets = [
    { name: 'India National & Regional (700+ Channels)', url: 'https://iptv-org.github.io/iptv/countries/in.m3u' },
    { name: 'Worldwide Live Sports & Cricket', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
    { name: '24/7 International News Channels', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
    { name: 'Global Cinema & Entertainment', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' }
  ];

  const showNotice = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  // Auto-check for updates silently on mount so update info is instant
  useEffect(() => {
    checkForAppUpdates('phone', false).then(info => {
      if (info) setUpdateInfo(info);
    }).catch(() => {});
  }, []);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const info = await checkForAppUpdates('phone', true);
      // v3.2.0 keystore cutover: debug-signed installs can't update in place
      // to a release-signed APK — show the one-time reinstall path instead.
      if (info.targetSigning === 'release' && !info.isReleaseSigned) {
        info.needsReinstall = true;
      }
      setUpdateInfo(info);
      if (!info.hasUpdate) {
        showNotice(`✓ App is up to date (v${info.currentVersion})`);
      } else if (info.needsReinstall) {
        showNotice('⚠ One-time reinstall needed for the new release key');
      } else {
        showNotice(`🚀 New update ready: v${info.latestVersion}!`);
      }
    } catch (e) {
      setUpdateError("Failed to check for updates: " + e.message);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = () => {
    if (!updateInfo || !updateInfo.apkUrl) {
      showNotice("Update URL not found");
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);
    setDownloadProgress(0);
    setUpdateStatusText('Connecting to update server...');

    startAppUpdate(
      updateInfo.apkUrl,
      (progress, downloaded, total) => {
        setDownloadProgress(progress);
        setDownloadStats({ downloaded, total });
        setUpdateStatusText(`Downloading APK: ${progress}%`);
      },
      (status, progress) => {
        if (status === 'READY_TO_INSTALL') {
          setUpdateStatusText('Launching Android Package Installer...');
          showNotice("✓ Download complete! Please tap 'Install' on the prompt.");
        } else if (status === 'BROWSER_DOWNLOAD_OPENED') {
          setUpdateStatusText('Download started in browser');
          setIsUpdating(false);
        }
      },
      (errMsg) => {
        setUpdateError(errMsg || "Download failed");
        setIsUpdating(false);
      }
    );
  };

  const handleSaveIPTV = () => {
    saveIPTVConfig({ jioTvHost, customM3uUrl });
    showNotice("Settings Saved! Reloading channels...");
    if (onReloadApp) onReloadApp();
  };

  const handleSelectPreset = (url, name) => {
    setCustomM3uUrl(url);
    saveIPTVConfig({ customM3uUrl: url });
    showNotice(`Loaded: ${name}`);
    if (onReloadApp) onReloadApp();
  };

  const handleSetSleepTimer = (timeStr) => {
    setSleepTimer(timeStr);
    let minutes = 0;
    if (timeStr === '15m') minutes = 15;
    else if (timeStr === '30m') minutes = 30;
    else if (timeStr === '45m') minutes = 45;
    else if (timeStr === '60m') minutes = 60;
    else if (timeStr === '120m') minutes = 120;

    applySleepTimer(minutes, () => {
      showNotice("🌙 Sleep Timer Expired: Playback Paused");
      const video = document.querySelector('video');
      if (video) video.pause();
    });

    showNotice(minutes > 0 ? `Sleep timer set for ${timeStr.toUpperCase()}` : "Sleep timer turned OFF");
  };

  const handleClearHistory = () => {
    clearWatchHistory();
    onClearHistory && onClearHistory();
    showNotice("Watch History Cleared!");
  };

  const handleFullReset = () => {
    if (window.confirm("Are you sure you want to reset all app settings, playlists, and cache?")) {
      clearAppCache();
      showNotice("Cache cleared. Reloading...");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
  };

  return (
    <div className="mobile-settings-container" style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
      {actionNotice && (
        <div className="mobile-toast-notice" style={{
          position: 'fixed',
          top: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1.5px solid #38bdf8',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)'
        }}>
          <Check size={16} color="#38bdf8" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* 🚀 ON-DEVICE OTA SOFTWARE UPDATE CARD */}
      <div className="mobile-settings-card" style={{
        background: 'linear-gradient(145deg, rgba(14, 20, 31, 0.95), rgba(22, 32, 50, 0.95))',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '16px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)'
      }}>
        <div className="mobile-settings-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <ArrowUpCircle size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                App Software Updates
              </h3>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                Current Installed: <strong style={{ color: '#38bdf8' }}>v{CURRENT_APP_VERSION}</strong>
              </span>
            </div>
          </div>

          <button
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate || isUpdating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              padding: '8px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              opacity: (isCheckingUpdate || isUpdating) ? 0.6 : 1
            }}
          >
            {isCheckingUpdate ? (
              <>
                <Loader2 size={14} className="spin-animation" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                <span>Check Update</span>
              </>
            )}
          </button>
        </div>

        {/* Update Error Banner */}
        {updateError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginTop: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#f87171',
            fontSize: '12px'
          }}>
            <AlertCircle size={16} />
            <span>{updateError}</span>
          </div>
        )}

        {/* Downloading Progress View */}
        {isUpdating && (
          <div style={{ marginTop: '14px', background: 'rgba(0, 0, 0, 0.3)', padding: '14px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {updateStatusText}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8' }}>
                {downloadProgress}%
              </span>
            </div>

            {/* Progress Track */}
            <div style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${downloadProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #3b82f6)',
                borderRadius: '4px',
                transition: 'width 0.2s ease'
              }} />
            </div>
          </div>
        )}

        {/* Update Available Card Details */}
        {updateInfo && updateInfo.hasUpdate && !isUpdating && (
          <div style={{
            marginTop: '14px',
            background: updateInfo.needsReinstall ? 'rgba(245, 158, 11, 0.08)' : 'rgba(56, 189, 248, 0.08)',
            border: updateInfo.needsReinstall ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '12px',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <span style={{
                  background: updateInfo.needsReinstall ? '#f59e0b' : '#22c55e',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 900,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  marginRight: '6px'
                }}>
                  {updateInfo.needsReinstall ? 'ONE-TIME REINSTALL' : 'NEW UPDATE'}
                </span>
                <strong style={{ color: '#fff', fontSize: '14px' }}>Version {updateInfo.latestVersion}</strong>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Size: {updateInfo.size}</span>
            </div>

            {updateInfo.needsReinstall && (
              <div style={{ margin: '10px 0', fontSize: '12px', color: '#fbbf24', lineHeight: '1.6', fontWeight: 700 }}>
                ⚠ AJO is switching to its permanent release key. Android requires a one-time uninstall → reinstall for this switch. Your watch history is preserved if you keep app data; the app reopens normally afterwards.
              </div>
            )}

            {updateInfo.changelog && updateInfo.changelog.length > 0 && (
              <div style={{ margin: '10px 0', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
                {updateInfo.changelog.map((log, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ color: '#38bdf8' }}>•</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleInstallUpdate}
              style={{
                width: '100%',
                marginTop: '8px',
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '12px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)'
              }}
            >
              <Download size={16} />
              <span>{updateInfo.needsReinstall ? 'Download & Reinstall (One Time)' : '1-Tap Download & Install Update'}</span>
            </button>
          </div>
        )}

        {/* Up-to-date Status Message */}
        {updateInfo && !updateInfo.hasUpdate && !isUpdating && (
          <div style={{
            marginTop: '12px',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#4ade80',
            fontSize: '12px',
            fontWeight: 700
          }}>
            <Check size={16} />
            <span>AJO is up to date with the latest features, streaming engines & ad blockers.</span>
          </div>
        )}
      </div>

      {/* Sleep Timer Section */}
      <div className="mobile-settings-card" style={{
        background: 'rgba(14, 20, 31, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '16px'
      }}>
        <div className="mobile-settings-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Moon size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: 0 }}>Playback Sleep Timer</h3>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
          Automatically pause playback after a set time.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['off', '15m', '30m', '45m', '60m', '120m'].map(time => (
            <button
              key={time}
              style={{
                background: sleepTimer === time ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'rgba(255, 255, 255, 0.08)',
                border: sleepTimer === time ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              onClick={() => handleSetSleepTimer(time)}
            >
              {time === 'off' ? 'Off' : time.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Watch History & Data Management */}
      <div className="mobile-settings-card" style={{
        background: 'rgba(14, 20, 31, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '16px'
      }}>
        <div className="mobile-settings-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <HardDrive size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: 0 }}>Storage & History</h3>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
          Manage local watch resume points and cached catalog data.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button 
            onClick={handleClearHistory}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Trash2 size={16} />
            <span>Clear Watch History & Continue Watching</span>
          </button>

          <button 
            onClick={handleFullReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} />
            <span>Reset App Cache & Reload</span>
          </button>
        </div>
      </div>

      {/* STREMIO ADDONS */}
      <div className="mobile-settings-card" style={{
        background: 'rgba(14, 20, 31, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '18px'
      }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', fontSize: '1rem' }}>
          <Puzzle size={18} color="#38bdf8" /> Addons (Stremio Compatible)
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 12px' }}>
          Install community addons for unlimited catalogs & streams.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {FEATURED_ADDONS.map(fa => {
            const installed = addons.some(a => a.id === fa.id);
            return (
              <button
                key={fa.id}
                onClick={() => handleInstallAddon(fa.url)}
                disabled={installed}
                style={{
                  padding: '8px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
                  background: installed ? 'rgba(34,197,94,0.15)' : 'rgba(56,189,248,0.12)',
                  border: `1px solid ${installed ? 'rgba(34,197,94,0.4)' : 'rgba(56,189,248,0.4)'}`,
                  color: installed ? '#22c55e' : '#38bdf8',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                {installed ? <CheckCircle2 size={13} /> : <Plus size={13} />}
                {installed ? fa.name : `Add ${fa.name}`}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={addonUrl}
            onChange={(e) => setAddonUrl(e.target.value)}
            placeholder="Paste addon manifest URL..."
            style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 8, color: '#fff', fontSize: '0.85rem' }}
          />
          <button onClick={() => handleInstallAddon()} disabled={!addonUrl} style={{
            padding: '10px 16px', borderRadius: 8, fontWeight: 800, fontSize: '0.85rem',
            background: addonUrl ? '#38bdf8' : 'rgba(148,163,184,0.2)', color: addonUrl ? '#06121f' : '#64748b', border: 'none', cursor: 'pointer'
          }}>Add</button>
        </div>
        {addonStatus && (
          <p style={{ marginTop: 8, fontSize: '0.8rem', fontWeight: 700, color: addonStatus.type === 'ok' ? '#22c55e' : addonStatus.type === 'err' ? '#ef4444' : '#38bdf8' }}>
            {addonStatus.msg}
          </p>
        )}
        {addons.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {addons.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.85rem' }}>{a.name}</span>
                <button onClick={() => handleRemoveAddon(a.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* IPTV & M3U Playlist Source */}
      <div className="mobile-settings-card" style={{
        background: 'rgba(14, 20, 31, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '16px'
      }}>
        <div className="mobile-settings-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Tv size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: 0 }}>Live TV & Playlist Source</h3>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
          Custom M3U playlist URL or 1-tap presets for 700+ live broadcast channels.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {playlistPresets.map((preset, idx) => (
            <button
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: customM3uUrl === preset.url ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: customM3uUrl === preset.url ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                padding: '10px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                color: '#fff',
                textAlign: 'left'
              }}
              onClick={() => handleSelectPreset(preset.url, preset.name)}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{preset.name}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{preset.url}</div>
              </div>
              {customM3uUrl === preset.url && <Check size={16} color="#38bdf8" />}
            </button>
          ))}
        </div>

        <div style={{ marginTop: '14px' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
            Custom M3U Playlist URL:
          </label>
          <input
            type="text"
            style={{
              width: '100%',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#ffffff',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            value={customM3uUrl}
            onChange={(e) => setCustomM3uUrl(e.target.value)}
            placeholder="https://example.com/playlist.m3u"
          />

          <button 
            onClick={handleSaveIPTV}
            style={{
              width: '100%',
              marginTop: '10px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              border: 'none',
              color: '#ffffff',
              padding: '10px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Check size={16} />
            <span>Save & Apply Playlist</span>
          </button>
        </div>
      </div>

      {/* App Info Card */}
      <div className="mobile-settings-card" style={{
        background: 'rgba(14, 20, 31, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '40px'
      }}>
        <div className="mobile-settings-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Info size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: 0 }}>About AJO Phone</h3>
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.8' }}>
          <p style={{ margin: 0 }}><strong style={{ color: '#fff' }}>Version:</strong> v{CURRENT_APP_VERSION} (Mobile Touch & OTA Edition)</p>
          <p style={{ margin: 0 }}><strong style={{ color: '#fff' }}>Streaming Engine:</strong> Direct Native HLS 4K + 60fps Hardware Acceleration</p>
          <p style={{ margin: 0 }}><strong style={{ color: '#fff' }}>OTA Updater:</strong> Built-in Native APK Installer</p>
          <p style={{ margin: 0 }}><strong style={{ color: '#fff' }}>Failover Protection:</strong> 6-Engine Mirror Redundancy</p>
        </div>
      </div>
    </div>
  );
}
