import React, { useEffect, useState, useMemo } from 'react';
import { Play, Star, Calendar, Clock, X, Server, Tv, RotateCcw } from 'lucide-react';
import { getSeriesEpisodes } from '../api/pikashow';
import { generateUniversalServers } from '../utils/streamingEngines';
import { hasNativePlayer, playInNativePlayer } from '../utils/nativePlayer';
import { getWatchHistory, deleteHistoryItem, getWatchProgress } from '../api/history';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MediaDetailsModal({ item, onClose, onStartPlayback }) {
  if (!item) return null;

  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedServer, setSelectedServer] = useState(0);

  const title = typeof item.title_en === 'string' && item.title_en
    ? item.title_en
    : typeof item.title === 'string' && item.title
    ? item.title
    : typeof item.name === 'string' && item.name
    ? item.name
    : 'Untitled';

  const poster = typeof item.poster_url === 'string' && item.poster_url
    ? item.poster_url
    : typeof item.poster === 'string' && item.poster
    ? item.poster
    : '';

  const year = typeof item.year === 'string' || typeof item.year === 'number' ? String(item.year) : '2024';
  const duration = typeof item.duration === 'string' || typeof item.duration === 'number' ? `${item.duration} min` : 'HD';

  let rating = '8.5';
  if (typeof item.rating === 'string' || typeof item.rating === 'number') {
    rating = String(item.rating);
  } else if (typeof item.ratings === 'object' && item.ratings !== null) {
    rating = String(item.ratings.imdb || item.ratings.kinopoisk || '8.5');
  }

  const description = typeof item.description === 'string' && item.description.trim()
    ? item.description
    : 'Enjoy streaming in crystal clear High Definition with multi-language audio support.';

  const isSeries = item.category === 'serials' || item.type === 'series' || item.type === 'serial';
  const isLive = item?.is_live || item?.type === 'live' || item?.year === 'LIVE';

  const watchProgress = useMemo(() => {
    return getWatchProgress(item);
  }, [item]);

  // Compute available servers
  const servers = useMemo(() => {
    return generateUniversalServers(item);
  }, [item]);

  // Load episodes if TV series
  useEffect(() => {
    if (isSeries && item.id) {
      setLoadingEpisodes(true);
      getSeriesEpisodes(item.id).then((eps) => {
        setEpisodes(eps || []);
        setLoadingEpisodes(false);
      }).catch(() => {
        setLoadingEpisodes(false);
      });
    }
  }, [isSeries, item]);

  // Initial focus on Watch button
  useEffect(() => {
    const timer = setTimeout(() => {
      const btn = document.querySelector('.tv-modal-actions .tv-btn-primary, .tv-btn-secondary');
      if (btn) {
        try { btn.focus(); } catch (_) {}
      }
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const handlePlay = (episodeItem = null, episodeIndex = 0) => {
    const targetItem = episodeItem || item;
    const srv = servers[selectedServer] || servers[0];
    if (onStartPlayback) {
      onStartPlayback(targetItem, srv, episodes, episodeIndex);
    }
  };

  return (
    <div className="tv-modal-overlay" onClick={onClose}>
      <div className="tv-modal-card" onClick={(e) => e.stopPropagation()}>
        <img
          src={poster}
          alt={title}
          className="tv-modal-poster"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />

        <div className="tv-modal-body">
          <h1 className="tv-modal-title">{title}</h1>

          <div className="tv-modal-meta-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f59e0b', fontWeight: 700 }}>
              <Star size={14} fill="#f59e0b" /> {rating}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={14} /> {year}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={14} /> {duration}
            </span>
            <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
              {isSeries ? 'TV SERIES' : isLive ? 'LIVE TV' : 'MOVIE'}
            </span>
          </div>

          <p className="tv-modal-desc">{description}</p>

          {/* Resume Progress Bar */}
          {watchProgress && (
            <div style={{ marginBottom: 16, background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>Resume Playback</span>
                <span>{formatTime(watchProgress.currentTime)} / {formatTime(watchProgress.duration)} ({watchProgress.percentage}%)</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${watchProgress.percentage}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
              </div>
            </div>
          )}

          {/* Available Servers Selector */}
          {servers.length > 1 && (
            <div style={{ marginBottom: 18 }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Select Streaming Server:
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {servers.map((srv, idx) => (
                  <button
                    key={srv.id || idx}
                    tabIndex={0}
                    className={`tv-cat-btn ${selectedServer === idx ? 'active' : ''}`}
                    onClick={() => setSelectedServer(idx)}
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    <Server size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {srv.name || `Server ${idx + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Episode List for TV Series */}
          {isSeries && episodes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Episodes ({episodes.length}):
              </span>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }} data-horizontal-scroll="true">
                {episodes.map((ep, idx) => (
                  <button
                    key={ep.id || idx}
                    tabIndex={0}
                    className="tv-btn-secondary"
                    onClick={() => handlePlay(ep, idx)}
                    style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                  >
                    Episode {String(ep.episode || idx + 1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="tv-modal-actions">
            {watchProgress ? (
              <>
                <button className="tv-btn-primary" tabIndex={0} onClick={() => handlePlay()}>
                  <Play size={18} fill="#07090e" />
                  <span>Resume ({formatTime(watchProgress.currentTime)})</span>
                </button>
                <button
                  className="tv-btn-secondary"
                  tabIndex={0}
                  onClick={() => {
                    deleteHistoryItem(item);
                    handlePlay();
                  }}
                  style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}
                >
                  <RotateCcw size={18} />
                  <span>Restart</span>
                </button>
              </>
            ) : (
              <button className="tv-btn-primary" tabIndex={0} onClick={() => handlePlay()}>
                <Play size={18} fill="#07090e" />
                <span>{isLive ? 'Watch Live' : 'Watch Now'}</span>
              </button>
            )}

            <button
              className="tv-btn-secondary"
              tabIndex={0}
              onClick={() => {
                const srv = servers[selectedServer] || servers[0];
                const streamUrl = srv?.url || srv?.src || '';
                if (!streamUrl) return;
                const fallbacks = servers
                  .filter((_, i) => i !== selectedServer)
                  .map((s) => s?.url)
                  .filter(Boolean);
                if (!playInNativePlayer(streamUrl, title, false, fallbacks)) {
                  handlePlay();
                }
              }}
              style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
            >
              <Tv size={18} />
              <span>{hasNativePlayer() ? 'Hardware Player' : 'Web Player'}</span>
            </button>

            <button className="tv-btn-secondary" tabIndex={0} onClick={onClose}>
              <X size={18} />
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
