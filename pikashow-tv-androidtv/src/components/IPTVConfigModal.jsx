import React, { useState } from 'react';
import { X, Tv, Save, Server, RefreshCw, Check } from 'lucide-react';
import { getIPTVConfig, saveIPTVConfig } from '../api/iptv';

export function IPTVConfigModal({ onClose, onConfigSaved }) {
  const current = getIPTVConfig();
  const [jioTvHost, setJioTvHost] = useState(current.jioTvHost);
  const [customM3uUrl, setCustomM3uUrl] = useState(current.customM3uUrl);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    saveIPTVConfig({ jioTvHost, customM3uUrl });
    setSavedSuccess(true);
    setTimeout(() => {
      onConfigSaved && onConfigSaved();
      onClose();
    }, 800);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <div className="modal-details-col" style={{ padding: '36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="logo-badge" style={{ width: '38px', height: '38px' }}>
                <Tv size={20} />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Live TV & JioTV Settings</h2>
            </div>
            <button 
              className="player-btn"
              data-focusable="true"
              tabIndex={0}
              onClick={onClose}
              style={{ width: '36px', height: '36px' }}
            >
              <X size={18} />
            </button>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
            Connect your local <strong>JioTV Go</strong> server instance or enter a custom M3U playlist URL to stream over 1,000+ live television channels.
          </p>

          {/* JioTV Server IP */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
              JioTV Go Server Address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="search-input"
                data-focusable="true"
                tabIndex={0}
                style={{ fontSize: '15px', padding: '12px 16px' }}
                placeholder="e.g. http://localhost:5001 or http://192.168.1.50:5001"
                value={jioTvHost}
                onChange={e => setJioTvHost(e.target.value)}
              />
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Default: http://localhost:5001 (If JioTV server is running locally or on TV)
            </span>
          </div>

          {/* Custom M3U URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase' }}>
              Custom M3U IPTV Playlist URL (Optional)
            </label>
            <input
              type="text"
              className="search-input"
              data-focusable="true"
              tabIndex={0}
              style={{ fontSize: '15px', padding: '12px 16px' }}
              placeholder="e.g. https://iptv-org.github.io/iptv/countries/in.m3u"
              value={customM3uUrl}
              onChange={e => setCustomM3uUrl(e.target.value)}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Supports 680+ Indian channels out of the box.
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '14px', marginTop: '24px' }}>
            <button
              className="tv-btn tv-btn-primary"
              data-focusable="true"
              tabIndex={0}
              onClick={handleSave}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {savedSuccess ? <Check size={18} /> : <Save size={18} />}
              {savedSuccess ? 'Saved & Synced!' : 'Save & Reload Channels'}
            </button>
            
            <button
              className="tv-btn tv-btn-secondary"
              data-focusable="true"
              tabIndex={0}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
