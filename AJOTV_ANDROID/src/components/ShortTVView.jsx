import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  ChevronUp, 
  ChevronDown, 
  ListOrdered, 
  Heart, 
  Bookmark, 
  Sparkles, 
  Layers,
  X,
  Flame,
  ArrowLeft,
  Tv,
  Star,
  Film
} from 'lucide-react';
import { SHORT_TV_SERIES } from '../api/shortTvCatalog';

export function ShortTVView({ onPlayFullscreen }) {
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [episodeDrawerOpen, setEpisodeDrawerOpen] = useState(false);
  const [filterGenre, setFilterGenre] = useState('all');
  const [progress, setProgress] = useState(0);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const currentSeries = selectedSeries || SHORT_TV_SERIES[0];
  const currentEpisode = currentSeries?.episodes?.[activeEpisodeIndex] || currentSeries?.episodes?.[0];

  // Filter series
  const filteredSeries = SHORT_TV_SERIES.filter(s => {
    if (filterGenre === 'all') return true;
    const g = (s.genre || '').toLowerCase() + ' ' + (s.description || '').toLowerCase();
    return g.includes(filterGenre);
  });

  // Initialize Hls.js when in player mode
  useEffect(() => {
    if (!selectedSeries) return;
    const video = videoRef.current;
    if (!video || !currentEpisode?.url) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = currentEpisode.url;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        startLevel: -1,
        capLevelToPlayerSize: true,
        abrEwmaDefaultEstimate: 5000000
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedSeries, activeEpisodeIndex, currentEpisode]);

  // Video progress & auto-advance
  useEffect(() => {
    if (!selectedSeries) return;
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };

    const handleEnded = () => {
      if (activeEpisodeIndex < (currentSeries.episodes.length - 1)) {
        setActiveEpisodeIndex(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [selectedSeries, activeEpisodeIndex, currentSeries]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // IF NO SERIES SELECTED: SHOW GORGEOUS 10-FOOT SHORT TV DRAMA GALLERY GRID
  if (!selectedSeries) {
    const heroDrama = SHORT_TV_SERIES[0];
    const genres = [
      { id: 'all', label: '🔥 All Short Dramas' },
      { id: 'romance', label: '❤️ Romance & CEO' },
      { id: 'action', label: '⚔️ Action & War' },
      { id: 'revenge', label: '👑 Heiress & Revenge' }
    ];

    return (
      <div className="tv-short-gallery" style={{ position: 'relative', zIndex: 20, width: '100%', padding: '0 0 40px 0' }}>
        {/* Spotlight Hero Banner */}
        {heroDrama && (
          <div style={{
            position: 'relative',
            width: '100%',
            height: '320px',
            borderRadius: '16px',
            overflow: 'hidden',
            marginBottom: '28px',
            background: 'linear-gradient(135deg, #0b1329 0%, #1e1b4b 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 36px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)'
          }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${heroDrama.cover})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 20%',
              opacity: 0.35,
              filter: 'blur(12px)',
              transform: 'scale(1.1)'
            }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #06090e 0%, rgba(6, 9, 14, 0.85) 50%, rgba(6, 9, 14, 0.3) 100%)' }} />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '32px', width: '100%' }}>
              <img
                src={heroDrama.cover}
                alt={heroDrama.title}
                style={{
                  width: '140px',
                  height: '210px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.8)',
                  border: '2px solid rgba(56, 189, 248, 0.5)',
                  flexShrink: 0
                }}
              />
              <div style={{ maxWidth: '680px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 900, background: '#ef4444', color: '#fff', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.5px' }}>
                    🔥 TRENDING SHORT DRAMA
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '3px 8px', borderRadius: '6px' }}>
                    ★ {heroDrama.rating}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#cbd5e1' }}>
                    {heroDrama.total_episodes} Episodes
                  </span>
                </div>
                <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>
                  {heroDrama.title}
                </h1>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {heroDrama.description}
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => {
                      setSelectedSeries(heroDrama);
                      setActiveEpisodeIndex(0);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                      border: 'none',
                      padding: '10px 24px',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 20px rgba(56, 189, 248, 0.4)'
                    }}
                  >
                    <Play size={16} fill="#fff" />
                    <span>Watch Series Now</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section Header & Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', padding: '0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flame size={16} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: 0 }}>
              ShortTV Mini-Drama Series Hub
            </h2>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: '10px' }}>
              {filteredSeries.length} Series
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {genres.map(g => (
              <button
                key={g.id}
                onClick={() => setFilterGenre(g.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  background: filterGenre === g.id ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)',
                  color: filterGenre === g.id ? '#06090e' : '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* 6-Column Responsive TV Grid */}
        <div 
          className="tv-portrait-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '24px 18px',
            width: '100%'
          }}
        >
          {filteredSeries.map((series, idx) => (
            <div
              key={series.id || idx}
              className="tv-card tv-portrait-card tv-focusable-card"
              data-focusable="true"
              tabIndex={0}
              onClick={() => {
                setSelectedSeries(series);
                setActiveEpisodeIndex(0);
              }}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}
            >
              <div 
                className="mobile-card-poster-box"
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '2 / 3',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#0e141f',
                  border: '1px solid rgba(255, 255, 255, 0.12)'
                }}
              >
                <img
                  src={series.cover}
                  alt={series.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />

                {/* Top Badges */}
                <div style={{ position: 'absolute', top: '6px', left: '6px', right: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '9px', fontWeight: 900, background: '#f59e0b', color: '#06090e', padding: '2px 5px', borderRadius: '4px' }}>
                    ★ {series.rating}
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 900, background: '#ef4444', color: '#fff', padding: '2px 5px', borderRadius: '4px' }}>
                    {series.total_episodes} EPS
                  </span>
                </div>

                {/* Play hover pill */}
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', width: '30px', height: '30px', borderRadius: '50%', background: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(56, 189, 248, 0.5)' }}>
                  <Play size={14} fill="#06090e" color="#06090e" style={{ marginLeft: '2px' }} />
                </div>
              </div>

              {/* Title Info */}
              <div style={{ marginTop: '8px', padding: '0 2px' }}>
                <h3 style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#ffffff',
                  margin: '0 0 2px 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {series.title}
                </h3>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{series.country}</span>
                  <span>•</span>
                  <span style={{ color: '#38bdf8' }}>{series.genre}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // PLAYER VIEW WHEN A SHORT DRAMA SERIES IS PLAYING
  return (
    <div className="tv-short-player" style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Video Container (Cinema Vertical Container with Blurred Ambient Background) */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${currentSeries.cover})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(30px) brightness(0.25)',
          transform: 'scale(1.2)'
        }}
      />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '460px',
        height: '92vh',
        background: '#06090e',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 0 60px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10
      }}>
        {/* Video Element */}
        <video
          ref={videoRef}
          onClick={togglePlay}
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', cursor: 'pointer' }}
        />

        {/* Top Floating Bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
          zIndex: 40
        }}>
          <button
            onClick={() => setSelectedSeries(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '20px',
              padding: '6px 14px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={16} />
            <span>All Dramas</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setEpisodeDrawerOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(56, 189, 248, 0.2)',
                border: '1px solid #38bdf8',
                borderRadius: '20px',
                padding: '6px 14px',
                color: '#38bdf8',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <ListOrdered size={14} />
              <span>Ep {activeEpisodeIndex + 1}/{currentSeries.episodes.length}</span>
            </button>

            <button
              onClick={toggleMute}
              style={{
                background: 'rgba(0, 0, 0, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              {isMuted ? <VolumeX size={16} color="#ef4444" /> : <Volume2 size={16} color="#38bdf8" />}
            </button>
          </div>
        </div>

        {/* Center Pause Indicator */}
        {!isPlaying && (
          <div 
            onClick={togglePlay}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.35)',
              zIndex: 30,
              cursor: 'pointer'
            }}
          >
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(56, 189, 248, 0.6)'
            }}>
              <Play size={28} fill="#06090e" color="#06090e" style={{ marginLeft: '3px' }} />
            </div>
          </div>
        )}

        {/* Bottom Details Overlay */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '24px 16px 16px 16px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, transparent 100%)',
          zIndex: 40
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
              {currentSeries.country}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8' }}>
              Episode {activeEpisodeIndex + 1}: {currentEpisode.title}
            </span>
          </div>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
            {currentSeries.title}
          </h2>

          {/* Progress bar */}
          <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '2px', overflow: 'hidden', marginTop: '10px' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#38bdf8' }} />
          </div>

          {/* Prev/Next Episode Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <button
              disabled={activeEpisodeIndex === 0}
              onClick={() => setActiveEpisodeIndex(prev => Math.max(0, prev - 1))}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                background: activeEpisodeIndex === 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.15)',
                color: activeEpisodeIndex === 0 ? '#64748b' : '#fff',
                border: 'none',
                fontWeight: 800,
                fontSize: '12px',
                cursor: activeEpisodeIndex === 0 ? 'default' : 'pointer'
              }}
            >
              ◀ Prev Episode
            </button>
            <button
              disabled={activeEpisodeIndex >= currentSeries.episodes.length - 1}
              onClick={() => setActiveEpisodeIndex(prev => Math.min(currentSeries.episodes.length - 1, prev + 1))}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                background: activeEpisodeIndex >= currentSeries.episodes.length - 1 ? 'rgba(255, 255, 255, 0.05)' : '#38bdf8',
                color: activeEpisodeIndex >= currentSeries.episodes.length - 1 ? '#64748b' : '#06090e',
                border: 'none',
                fontWeight: 900,
                fontSize: '12px',
                cursor: activeEpisodeIndex >= currentSeries.episodes.length - 1 ? 'default' : 'pointer'
              }}
            >
              Next Episode ▶
            </button>
          </div>
        </div>

        {/* Episode Drawer */}
        {episodeDrawerOpen && (
          <div 
            onClick={() => setEpisodeDrawerOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end'
            }}
          >
            <div 
              onClick={e => e.stopPropagation()}
              style={{
                background: '#0f172a',
                borderTopLeftRadius: '20px',
                borderTopRightRadius: '20px',
                padding: '16px',
                maxHeight: '65vh',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#fff', margin: 0 }}>
                  Select Episode ({currentSeries.episodes.length} Total)
                </h3>
                <button
                  onClick={() => setEpisodeDrawerOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentSeries.episodes.map((ep, eIdx) => (
                  <button
                    key={ep.episode || eIdx}
                    onClick={() => {
                      setActiveEpisodeIndex(eIdx);
                      setEpisodeDrawerOpen(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: activeEpisodeIndex === eIdx ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: activeEpisodeIndex === eIdx ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: activeEpisodeIndex === eIdx ? '#38bdf8' : '#fff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: '13px' }}>
                      {ep.title}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {ep.duration}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
