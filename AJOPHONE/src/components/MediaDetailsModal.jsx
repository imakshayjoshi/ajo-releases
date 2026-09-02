import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Play, Star, Calendar, Clock, X, Server, Tv, RotateCcw } from 'lucide-react';
import { getSeriesEpisodes } from '../api/pikashow';
import { getTmdbEpisodes } from '../api/tmdb';
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

  const [audioLang, setAudioLang] = useState('all');

  // Compute available servers
  const servers = useMemo(() => {
    return generateUniversalServers(item);
  }, [item]);

  const filteredServers = useMemo(() => {
    if (audioLang === 'hi') {
      const hi = servers.filter(s => (s.name || '').includes('Hindi') || (s.name || '').includes('Multi') || (s.url || '').includes('lang=hi') || (s.url || '').includes('audio=hi'));
      return hi.length > 0 ? hi : servers;
    }
    if (audioLang === 'en') {
      const en = servers.filter(s => !(s.name || '').includes('Hindi') && !(s.url || '').includes('lang=hi'));
      return en.length > 0 ? en : servers;
    }
    return servers;
  }, [servers, audioLang]);

  // Load episodes if TV series
  useEffect(() => {
    if (isSeries && item) {
      setLoadingEpisodes(true);
      let tmdbId = item.tmdb_id;
      if (!tmdbId && typeof item.id === 'string' && item.id.startsWith('tmdb-')) {
        const parts = item.id.split('-');
        const candidate = parts[parts.length - 1];
        if (/^\d+$/.test(candidate)) tmdbId = Number(candidate);
      }

      if (tmdbId) {
        getTmdbEpisodes(tmdbId, selectedSeason).then((eps) => {
          if (eps && eps.length > 0) {
            setEpisodes(eps);
            setLoadingEpisodes(false);
          } else {
            getSeriesEpisodes(item.id).then((fallbackEps) => {
              setEpisodes(fallbackEps || []);
              setLoadingEpisodes(false);
            }).catch(() => setLoadingEpisodes(false));
          }
        }).catch(() => {
          getSeriesEpisodes(item.id).then((fallbackEps) => {
            setEpisodes(fallbackEps || []);
            setLoadingEpisodes(false);
          }).catch(() => setLoadingEpisodes(false));
        });
      } else {
        getSeriesEpisodes(item.id).then((eps) => {
          setEpisodes(eps || []);
          setLoadingEpisodes(false);
        }).catch(() => {
          setLoadingEpisodes(false);
        });
      }
    }
  }, [isSeries, item, selectedSeason]);

  const [showServerMenu, setShowServerMenu] = useState(false);
  const watchBtnRef = useRef(null);

  // Initial focus directly on the Watch/Resume button
  useEffect(() => {
    const timer = setTimeout(() => {
      if (watchBtnRef.current) {
        try { watchBtnRef.current.focus(); } catch (_) {}
      } else {
        const btn = document.querySelector('.tv-modal-actions .tv-btn-primary');
        if (btn) {
          try { btn.focus(); } catch (_) {}
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handlePlay = (episodeItem = null, episodeIndex = 0, specificServer = null) => {
    const targetItem = episodeItem || item;
    const srv = specificServer || (selectedServer < filteredServers.length ? (filteredServers[selectedServer] || null) : null);
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h1 className="tv-modal-title" style={{ flex: 1, margin: 0 }}>{title}</h1>
            <button
              className="tv-modal-close-btn"
              tabIndex={-1}
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#94a3b8',
                padding: '6px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="tv-modal-meta-row" style={{ margin: '8px 0 12px 0' }}>
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

          {/* Primary Action Buttons — Instant Play */}
          <div className="tv-modal-actions" style={{ marginBottom: 12 }}>
            {watchProgress ? (
              <>
                <button ref={watchBtnRef} id="modal-primary-watch-btn" className="tv-btn-primary" tabIndex={0} onClick={() => handlePlay()}>
                  <Play size={18} fill="#07090e" />
                  <span>Resume at {formatTime(watchProgress.currentTime)}</span>
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
              <button ref={watchBtnRef} id="modal-primary-watch-btn" className="tv-btn-primary" tabIndex={0} onClick={() => handlePlay()}>
                <Play size={18} fill="#07090e" />
                <span>{isLive ? 'Watch Live' : '▶ Watch Now'}</span>
              </button>
            )}

            <button
              className="tv-btn-secondary"
              tabIndex={0}
              onClick={() => {
                const srv = filteredServers[selectedServer] || servers[0];
                const streamUrl = srv?.url || srv?.src || '';
                if (!streamUrl) return;
                const fallbacks = filteredServers
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
          </div>

          {/* Resume Progress Bar */}
          {watchProgress && (
            <div style={{ marginBottom: 12, background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>Watching in Progress</span>
                <span>{formatTime(watchProgress.currentTime)} / {formatTime(watchProgress.duration)} ({watchProgress.percentage}%)</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${watchProgress.percentage}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
              </div>
            </div>
          )}

          {/* Audio Language Selection */}
          {servers.some(s => (s.name || '').includes('Hindi') || (s.url || '').includes('lang=hi') || (s.url || '').includes('audio=hi')) && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Audio:
              </span>
              <button
                tabIndex={0}
                className={`tv-cat-btn ${audioLang === 'hi' ? 'active' : ''}`}
                onClick={() => { setAudioLang('hi'); setSelectedServer(0); }}
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              >
                🇮🇳 Hindi Dubbed / Multi
              </button>
              <button
                tabIndex={0}
                className={`tv-cat-btn ${audioLang === 'en' ? 'active' : ''}`}
                onClick={() => { setAudioLang('en'); setSelectedServer(0); }}
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              >
                🇬🇧 English Original
              </button>
            </div>
          )}

          {/* Optional Collapsible Server Selector */}
          {filteredServers.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <button
                tabIndex={0}
                className="tv-btn-secondary"
                onClick={() => setShowServerMenu(!showServerMenu)}
                style={{
                  fontSize: '0.8rem',
                  padding: '6px 14px',
                  borderRadius: 8,
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8',
                  width: '100%',
                  justifyContent: 'space-between'
                }}
              >
                <span>⚡ Server: <strong style={{ color: '#38bdf8' }}>{filteredServers[selectedServer]?.name || `Server ${selectedServer + 1}`}</strong></span>
                <span>{showServerMenu ? '▲ Hide Mirrors' : '▼ Change Mirror'}</span>
              </button>

              {showServerMenu && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {filteredServers.map((srv, idx) => (
                    <button
                      key={srv.id || srv.url || idx}
                      tabIndex={0}
                      className={`tv-cat-btn ${selectedServer === idx ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedServer(idx);
                        handlePlay(null, 0, srv);
                      }}
                      style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                    >
                      <Play size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {srv.name || `Server ${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="tv-modal-desc" style={{ marginBottom: 14 }}>{description}</p>

          {/* Season Selector for TV Series */}
          {isSeries && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Seasons:
              </span>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }} data-horizontal-scroll="true">
                {[1, 2, 3, 4, 5, 6, 7, 8].slice(0, Math.max(1, item.number_of_seasons || item.seasons_count || 6)).map(sNum => (
                  <button
                    key={sNum}
                    tabIndex={0}
                    className={`tv-cat-btn ${selectedSeason === sNum ? 'active' : ''}`}
                    onClick={() => setSelectedSeason(sNum)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.82rem',
                      whiteSpace: 'nowrap',
                      borderRadius: '8px',
                      background: selectedSeason === sNum ? 'linear-gradient(135deg, #38bdf8, #0284c7)' : 'rgba(255, 255, 255, 0.08)',
                      color: selectedSeason === sNum ? '#06090e' : '#ffffff',
                      fontWeight: 800,
                      border: selectedSeason === sNum ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)'
                    }}
                  >
                    Season {sNum}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Episode List for TV Series */}
          {isSeries && episodes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Season {selectedSeason} Episodes ({episodes.length}):
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
        </div>
      </div>
    </div>
  );
}
