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
  Share2, 
  Sparkles, 
  Layers,
  X,
  Check,
  Film
} from 'lucide-react';
import { SHORT_TV_SERIES } from '../api/shortTvCatalog';

export function ShortTVView({ onPlayFullscreen }) {
  const [activeSeriesIndex, setActiveSeriesIndex] = useState(0);
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [episodeDrawerOpen, setEpisodeDrawerOpen] = useState(false);
  const [seriesDrawerOpen, setSeriesDrawerOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const currentSeries = SHORT_TV_SERIES[activeSeriesIndex] || SHORT_TV_SERIES[0];
  const currentEpisode = currentSeries?.episodes?.[activeEpisodeIndex] || currentSeries?.episodes?.[0];

  // Initialize Hls.js stream on episode change
  useEffect(() => {
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
  }, [currentSeries, currentEpisode]);

  // Video progress and auto-advance
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };

    const handleEnded = () => {
      // Auto advance to next episode
      if (activeEpisodeIndex < (currentSeries.episodes.length - 1)) {
        setActiveEpisodeIndex(prev => prev + 1);
      } else if (activeSeriesIndex < (SHORT_TV_SERIES.length - 1)) {
        setActiveSeriesIndex(prev => prev + 1);
        setActiveEpisodeIndex(0);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [activeEpisodeIndex, activeSeriesIndex, currentSeries]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleNextEpisode = () => {
    if (activeEpisodeIndex < currentSeries.episodes.length - 1) {
      setActiveEpisodeIndex(prev => prev + 1);
    }
  };

  const handlePrevEpisode = () => {
    if (activeEpisodeIndex > 0) {
      setActiveEpisodeIndex(prev => prev - 1);
    }
  };

  return (
    <div className="short-tv-viewport" style={{
      position: 'relative',
      width: '100%',
      height: 'calc(100vh - 75px)',
      background: '#000000',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20
    }}>
      {/* Video Element */}
      <video
        ref={videoRef}
        playsInline
        muted={isMuted}
        onClick={togglePlay}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          background: '#0a0a0a',
          cursor: 'pointer'
        }}
      />

      {/* Progress Bar (Bottom) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '3px',
        background: 'rgba(255, 255, 255, 0.2)',
        zIndex: 50
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: '#38bdf8',
          transition: 'width 0.2s linear'
        }} />
      </div>

      {/* Top Overlay: Series Title & Switcher */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 40,
        pointerEvents: 'auto'
      }}>
        <button
          onClick={() => setSeriesDrawerOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '6px 14px',
            borderRadius: '20px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)'
          }}
        >
          <Sparkles size={14} color="#f59e0b" />
          <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentSeries.title}
          </span>
          <Layers size={13} color="#94a3b8" />
        </button>

        {/* Mute Button */}
        <button
          onClick={toggleMute}
          style={{
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          {isMuted ? <VolumeX size={18} color="#ef4444" /> : <Volume2 size={18} color="#38bdf8" />}
        </button>
      </div>

      {/* Center Play/Pause Indicator (Only when paused) */}
      {!isPlaying && (
        <div 
          onClick={togglePlay}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.3)',
            zIndex: 30,
            cursor: 'pointer'
          }}
        >
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(56, 189, 248, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(56, 189, 248, 0.6)'
          }}>
            <Play size={30} fill="#fff" color="#fff" style={{ marginLeft: '4px' }} />
          </div>
        </div>
      )}

      {/* Right Action Sidebar (Like, Bookmark, Episodes, Up/Down) */}
      <div style={{
        position: 'absolute',
        right: '12px',
        bottom: '80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        zIndex: 40
      }}>
        {/* Like */}
        <button
          onClick={() => setLiked(!liked)}
          style={{
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <Heart size={20} fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : '#fff'} />
        </button>

        {/* Bookmark */}
        <button
          onClick={() => setBookmarked(!bookmarked)}
          style={{
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <Bookmark size={20} fill={bookmarked ? '#f59e0b' : 'none'} color={bookmarked ? '#f59e0b' : '#fff'} />
        </button>

        {/* Episodes Drawer Button */}
        <button
          onClick={() => setEpisodeDrawerOpen(true)}
          style={{
            background: 'rgba(56, 189, 248, 0.25)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #38bdf8',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <ListOrdered size={20} color="#38bdf8" />
        </button>

        {/* Next / Prev Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            onClick={handlePrevEpisode}
            disabled={activeEpisodeIndex === 0}
            style={{
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: activeEpisodeIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: activeEpisodeIndex === 0 ? 0.3 : 1
            }}
          >
            <ChevronUp size={20} color="#fff" />
          </button>
          <button
            onClick={handleNextEpisode}
            disabled={activeEpisodeIndex >= currentSeries.episodes.length - 1}
            style={{
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: activeEpisodeIndex >= currentSeries.episodes.length - 1 ? 'not-allowed' : 'pointer',
              opacity: activeEpisodeIndex >= currentSeries.episodes.length - 1 ? 0.3 : 1
            }}
          >
            <ChevronDown size={20} color="#fff" />
          </button>
        </div>
      </div>

      {/* Bottom Info Overlay */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '14px',
        right: '70px',
        zIndex: 40,
        pointerEvents: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 900,
            padding: '2px 8px',
            borderRadius: '6px'
          }}>
            EP {activeEpisodeIndex + 1} / {currentSeries.total_episodes}
          </span>
          <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 800 }}>
            {currentSeries.genre}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
            {currentSeries.country}
          </span>
        </div>

        <h3 style={{
          fontSize: '15px',
          fontWeight: 900,
          color: '#ffffff',
          margin: '0 0 4px 0',
          textShadow: '0 2px 8px rgba(0,0,0,0.9)'
        }}>
          {currentEpisode.title}
        </h3>

        <p style={{
          fontSize: '12px',
          color: '#cbd5e1',
          margin: 0,
          lineHeight: '1.4',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textShadow: '0 1px 4px rgba(0,0,0,0.9)'
        }}>
          {currentSeries.description}
        </p>
      </div>

      {/* Episodes Drawer Modal */}
      {episodeDrawerOpen && (
        <div
          onClick={() => setEpisodeDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0f172a',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '70vh',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#fff', margin: 0 }}>
                Select Episode ({currentSeries.episodes.length} Available)
              </h3>
              <button
                onClick={() => setEpisodeDrawerOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{
              padding: '12px',
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px'
            }}>
              {currentSeries.episodes.map((ep, idx) => {
                const isSelected = activeEpisodeIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setActiveEpisodeIndex(idx);
                      setEpisodeDrawerOpen(false);
                    }}
                    style={{
                      padding: '10px 4px',
                      borderRadius: '10px',
                      background: isSelected ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'rgba(255, 255, 255, 0.05)',
                      border: isSelected ? '1px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isSelected ? '#ffffff' : '#94a3b8',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    EP {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Series Switcher Drawer Modal */}
      {seriesDrawerOpen && (
        <div
          onClick={() => setSeriesDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0f172a',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '75vh',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#fff', margin: 0 }}>
                Explore Drama Shorts & Mini-Series
              </h3>
              <button
                onClick={() => setSeriesDrawerOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{
              padding: '12px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {SHORT_TV_SERIES.map((series, sIdx) => {
                const isSelected = activeSeriesIndex === sIdx;
                return (
                  <div
                    key={series.id}
                    onClick={() => {
                      setActiveSeriesIndex(sIdx);
                      setActiveEpisodeIndex(0);
                      setSeriesDrawerOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      padding: '10px',
                      borderRadius: '12px',
                      background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer'
                    }}
                  >
                    <img
                      src={series.cover}
                      alt={series.title}
                      style={{
                        width: '56px',
                        height: '76px',
                        borderRadius: '8px',
                        objectFit: 'cover'
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 900, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                          {series.country}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#38bdf8' }}>
                          {series.total_episodes} Episodes
                        </span>
                      </div>
                      <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#fff', margin: '0 0 2px 0' }}>
                        {series.title}
                      </h4>
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                        {series.genre} • ★ {series.rating}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
