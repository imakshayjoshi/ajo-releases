import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Trash2, 
  Play, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Film, 
  Tv, 
  ArrowLeft,
  XCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { 
  subscribeDownloads, 
  deleteOfflineDownload, 
  cancelOfflineDownload, 
  playOfflineVideo,
  getDeviceStorageInfo,
  formatBytes 
} from '../api/offlineDownloads';

export function DownloadsView({ onBack, onPlayMedia }) {
  const [downloads, setDownloads] = useState([]);
  const [storageInfo, setStorageInfo] = useState({ freeBytes: 0, totalBytes: 0 });
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'completed' | 'downloading'

  useEffect(() => {
    const unsub = subscribeDownloads(setDownloads);
    getDeviceStorageInfo().then(setStorageInfo);
    const interval = setInterval(() => {
      getDeviceStorageInfo().then(setStorageInfo);
    }, 5000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const totalDownloadedBytes = downloads.reduce((acc, d) => acc + (d.status === 'completed' ? (d.totalBytes || 0) : (d.bytesDownloaded || 0)), 0);

  const filteredDownloads = downloads.filter(d => {
    if (activeFilter === 'completed') return d.status === 'completed';
    if (activeFilter === 'downloading') return d.status === 'downloading' || d.status === 'starting';
    return true;
  });

  const handlePlay = (item) => {
    // Try native hardware player first
    const played = playOfflineVideo(item);
    if (!played && onPlayMedia) {
      // Fallback: pass to app's in-app player
      onPlayMedia(item.originalItem || item, { url: item.localPath || item.url, name: 'Offline Storage' });
    }
  };

  return (
    <div className="mobile-downloads-view" style={{ padding: '16px', minHeight: '100vh', background: '#06090e', color: '#fff', paddingBottom: '90px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button 
              onClick={onBack}
              style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={22} color="#38bdf8" />
              <span>Offline Downloads</span>
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
              Watch your favorite movies & series without internet
            </p>
          </div>
        </div>
      </div>

      {/* Device Storage Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: '14px',
        padding: '16px',
        marginBottom: '20px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={18} color="#38bdf8" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>Device Storage</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>
            {formatBytes(totalDownloadedBytes)} used by AJO
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
          <div style={{
            width: `${Math.min(100, Math.max(5, (totalDownloadedBytes / (storageInfo.totalBytes || 1)) * 100))}%`,
            background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)',
            borderRadius: '4px'
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.75rem', color: '#94a3b8' }}>
          <span>Free Space: {formatBytes(storageInfo.freeBytes)}</span>
          <span>Total Space: {formatBytes(storageInfo.totalBytes)}</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { id: 'all', label: `All (${downloads.length})` },
          { id: 'completed', label: `Downloaded (${downloads.filter(d => d.status === 'completed').length})` },
          { id: 'downloading', label: `In Progress (${downloads.filter(d => d.status === 'downloading' || d.status === 'starting').length})` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: activeFilter === tab.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
              background: activeFilter === tab.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
              color: activeFilter === tab.id ? '#38bdf8' : '#94a3b8',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Downloads List */}
      {filteredDownloads.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'rgba(15, 23, 42, 0.4)',
          borderRadius: '16px',
          border: '1px dashed rgba(255,255,255,0.1)'
        }}>
          <Film size={48} color="#475569" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px', color: '#e2e8f0' }}>
            {activeFilter === 'completed' ? 'No Completed Downloads' : activeFilter === 'downloading' ? 'No Active Downloads' : 'No Downloads Yet'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '280px', margin: '0 auto 16px' }}>
            Tap the "Download" button on any movie or series to save it for offline watching anywhere.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredDownloads.map(item => {
            const isCompleted = item.status === 'completed';
            const isDownloading = item.status === 'downloading' || item.status === 'starting';
            const isError = item.status === 'error';

            return (
              <div 
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Poster Thumbnail */}
                <div style={{
                  width: '64px',
                  height: '90px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#1e293b',
                  flexShrink: 0,
                  position: 'relative'
                }}>
                  {item.poster ? (
                    <img 
                      src={item.poster} 
                      alt={item.title} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Film size={24} color="#64748b" />
                    </div>
                  )}
                  {isCompleted && (
                    <div style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      background: '#10b981',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <CheckCircle2 size={12} color="#fff" />
                    </div>
                  )}
                </div>

                {/* Content Info & Progress */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    margin: '0 0 4px',
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {item.title}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>
                    {item.episode && (
                      <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        Episode
                      </span>
                    )}
                    <span>{formatBytes(item.totalBytes || item.bytesDownloaded || 0)}</span>
                    {isCompleted && <span style={{ color: '#10b981', fontWeight: 600 }}>• Ready Offline</span>}
                    {isError && <span style={{ color: '#ef4444', fontWeight: 600 }}>• Download Failed</span>}
                  </div>

                  {/* Active Download Progress Bar */}
                  {isDownloading && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#38bdf8', marginBottom: '4px', fontWeight: 600 }}>
                        <span>Downloading...</span>
                        <span>{item.progress >= 0 ? `${item.progress}%` : formatBytes(item.bytesDownloaded)}</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.max(5, item.progress || 0)}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #38bdf8, #2563eb)',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {isError && (
                    <div style={{ fontSize: '0.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} />
                      <span>{item.error || 'Connection failed. Please retry.'}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isCompleted && (
                    <button
                      onClick={() => handlePlay(item)}
                      style={{
                        background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '38px',
                        height: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#06090e',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
                      }}
                      title="Play Offline"
                    >
                      <Play size={18} fill="#06090e" style={{ marginLeft: 2 }} />
                    </button>
                  )}

                  {isDownloading && (
                    <button
                      onClick={() => cancelOfflineDownload(item.id)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '50%',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ef4444',
                        cursor: 'pointer'
                      }}
                      title="Cancel Download"
                    >
                      <XCircle size={18} />
                    </button>
                  )}

                  <button
                    onClick={() => deleteOfflineDownload(item.id)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '50%',
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94a3b8',
                      cursor: 'pointer'
                    }}
                    title="Delete Download"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
