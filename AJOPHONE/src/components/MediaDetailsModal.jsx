import React, { useState, useEffect, useMemo } from 'react';
import { Play, X, Star, Radio, Film, Tv, Sparkles, Bookmark, Check, Layers, Cast } from 'lucide-react';
import { getSeriesEpisodes } from '../api/pikashow';
import { getSourceProvider } from '../utils/sourceProvider';
import { generateUniversalServers } from '../utils/streamingEngines';
import { isFavorite, toggleFavorite } from '../api/history';
import { castEngine } from '../api/castSync';

export function MediaDetailsModal({ item, onClose, onStartPlayback }) {
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [castSent, setCastSent] = useState(false);

  const isLive = item?.is_live || item?.type === 'live' || item?.year === 'LIVE';
  const provider = getSourceProvider(item);

  // Generate complete set of direct + 1Flex servers
  const availableServers = useMemo(() => {
    if (!item) return [];
    if (isLive) {
      return item.players || item.player || [{ url: item.url, source: 'm3u8', name: 'Server 1 (Direct 1080p)' }];
    }
    return generateUniversalServers(item);
  }, [item, isLive]);

  useEffect(() => {
    if (!item) return;

    setIsFav(isFavorite(item));
    setSelectedServer(availableServers[0] || null);

    if (item.type === 'series' || item.type === 'serial') {
      setLoadingEpisodes(true);
      const id = item.kinopoisk_id || item.id || item.movie_id;
      getSeriesEpisodes(id)
        .then(res => setEpisodes(res || []))
        .finally(() => setLoadingEpisodes(false));
    }
  }, [item, availableServers]);

  const handleCastToTV = () => {
    castEngine.castMedia(item, {
      server: selectedServer
    }).catch(() => {});
    setCastSent(true);
    setTimeout(() => setCastSent(false), 3000);
    if (navigator.vibrate) {
      try { navigator.vibrate([40, 30, 40]); } catch (e) {}
    }
  };

  if (!item) return null;

  const title = item.title_en || item.title || item.title_ru || item.name || "Untitled";
  const rating = item.ratings?.mlab?.rating || item.ratings?.imdb?.rating || (isLive ? 'LIVE' : '8.5');
  const poster = item.poster_url || item.poster || item.logo || item.backdrop_url || '';

  return (
    <div className="mobile-modal-backdrop" onClick={onClose}>
      <div className="mobile-bottom-sheet" onClick={e => e.stopPropagation()}>
        {/* Drag handle */}
        <div className="mobile-sheet-handle" onClick={onClose} />

        {/* Close Button */}
        <button 
          className="mobile-sheet-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="mobile-sheet-scrollable">
          {/* Header Info with Poster */}
          <div className="mobile-sheet-header">
            {poster ? (
              <img 
                src={poster} 
                alt={title} 
                className="mobile-sheet-poster"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="mobile-sheet-poster-fallback">
                <Film size={32} color="#38bdf8" />
              </div>
            )}

            <div className="mobile-sheet-meta">
              <div className="mobile-sheet-badges">
                <span 
                  className="mobile-sheet-badge" 
                  style={{ background: provider.color, color: '#fff' }}
                >
                  {provider.icon} {provider.name}
                </span>

                {isLive ? (
                  <span className="mobile-sheet-badge is-live">LIVE</span>
                ) : (
                  <span className="mobile-sheet-badge is-quality">4K UHD</span>
                )}

                <span className="mobile-sheet-badge is-rating">
                  <Star size={11} fill="#facc15" strokeWidth={0} />
                  {typeof rating === 'number' ? rating.toFixed(1) : rating}
                </span>
              </div>

              <h2 className="mobile-sheet-title">{title}</h2>
              <span className="mobile-sheet-sub">
                {item.year || (isLive ? 'Live Stream' : '2026')} • {item.genres?.[0]?.name || (isLive ? 'Live Channel' : 'Action')}
              </span>
            </div>
          </div>

          {/* Primary Touch Actions */}
          <div className="mobile-sheet-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="mobile-sheet-primary-btn"
              style={{ flex: 1, minWidth: '130px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onClick={() => onStartPlayback(item, selectedServer)}
            >
              <Play size={18} fill="#06090e" />
              <span>{isLive ? 'Watch Live' : 'Play Now'}</span>
            </button>

            <button
              className="mobile-sheet-watchlist-btn"
              style={{
                minHeight: '44px',
                padding: '0 14px',
                background: castSent ? 'rgba(56, 189, 248, 0.25)' : 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={handleCastToTV}
            >
              <Cast size={18} />
              <span>{castSent ? 'Casting to TV...' : 'Play on TV'}</span>
            </button>

            <button
              className={`mobile-sheet-watchlist-btn ${isFav ? 'is-active' : ''}`}
              style={{ minHeight: '44px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => {
                toggleFavorite(item);
                setIsFav(prev => !prev);
              }}
            >
              {isFav ? <Check size={18} /> : <Bookmark size={18} />}
              <span>{isFav ? 'Saved' : 'Watchlist'}</span>
            </button>
          </div>

          {/* Synopsis */}
          <div className="mobile-sheet-section">
            <p className="mobile-sheet-desc">
              {item.description || (isLive ? `Official live broadcast of ${title} with high-definition audio and low latency.` : 'Stream high-definition media directly with fast multi-server failover.')}
            </p>
          </div>

          {/* Streaming Server Selector Pills */}
          <div className="mobile-sheet-section">
            <div className="mobile-sheet-section-title">
              <Sparkles size={14} color="#38bdf8" />
              <span>{isLive ? 'Streaming Sources' : 'Select Server / Mirror'}</span>
            </div>

            <div className="mobile-server-pills">
              {availableServers.map((p, idx) => {
                const isSelected = selectedServer?.id ? selectedServer.id === p.id : selectedServer?.url === p.url;
                const label = p.name || p.translator || `Server ${idx + 1}`;
                return (
                  <button
                    key={p.id || idx}
                    className={`mobile-server-pill ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedServer(p);
                      onStartPlayback(item, p);
                    }}
                  >
                    {isLive ? <Radio size={13} /> : <Film size={13} />}
                    <span>{label}</span>
                    {p.badge && <span className="mobile-server-badge">{p.badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TV Series Episodes List */}
          {episodes.length > 0 && (
            <div className="mobile-sheet-section" style={{ paddingBottom: '20px' }}>
              <div className="mobile-sheet-section-title">
                <Layers size={14} color="#38bdf8" />
                <span>Episodes & Seasons ({episodes.length})</span>
              </div>

              <div className="mobile-episodes-list">
                {episodes.map((ep, idx) => (
                  <button
                    key={idx}
                    className="mobile-episode-item"
                    onClick={() => onStartPlayback({ ...item, title: `${title} - E${idx + 1}` }, { url: ep.url, source: 'm3u8' })}
                  >
                    <div className="mobile-episode-num">{idx + 1}</div>
                    <div className="mobile-episode-info">
                      <span className="mobile-episode-name">{ep.name || `Episode ${idx + 1}`}</span>
                      <span className="mobile-episode-quality">1080p HD • Multi-Audio</span>
                    </div>
                    <Play size={16} color="#38bdf8" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
