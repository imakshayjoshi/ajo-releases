import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  ArrowLeft, 
  Check, 
  Loader2, 
  Pause, 
  Play, 
  RotateCcw, 
  RotateCw, 
  Settings2,
  History, 
  Volume2, 
  VolumeX, 
  Cast, 
  Tv, 
  Radio, 
  FastForward, 
  Rewind 
} from 'lucide-react';
import { saveProgress, getWatchHistory, getWatchProgress } from '../api/history';
import { markChannelDead } from '../api/iptv';
import { CatchupDrawer } from './CatchupDrawer';
import { detectStreamType, generateUniversalServers } from '../utils/streamingEngines';
import { castEngine } from '../api/castSync';
import { getLiveConfig, getVodConfig, createErrorHandler } from '../utils/hlsConfig';

const STARTUP_TIMEOUT_MS = 6500;
const REBUFFER_TIMEOUT_MS = 6000;
const AUTO_DISMISS_DELAY_MS = 3000;

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

export function TVPlayer({ item, server, channels = [], onSelectChannel, onClose }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const timeoutRef = useRef(null);
  const controlsTimerRef = useRef(null);
  const retriesRef = useRef(0);
  // v3.2.0 watchdog: wall-clock timestamps (timeupdate fires ~4x/sec, so tick
  // counting would be 4x too fast). 0 = timer not armed.
  const noStartSinceRef = useRef(0);
  const frameStallSinceRef = useRef(0);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCatchup, setShowCatchup] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState(null);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [castSuccess, setCastSuccess] = useState(false);
  const rotateFlippedRef = useRef(false);
  const resumePositionRef = useRef(null);

  // ---- ZOOM / FIT MODES: cycle Clean (VBI crop) → Fit → Zoom → Stretch.
  // Pinch on the video adjusts free-form zoom (phone); double-tap cycles.
  // NOTE: cycleFit references resetControlsTimer which is defined below —
  // use a ref indirection so hoisting is never an issue.
  const resetControlsTimerRef = useRef(() => {});
  const FIT_MODES = ['clean', 'contain', 'cover', 'fill'];
  const [fitMode, setFitMode] = useState('clean');
  const [pinchScale, setPinchScale] = useState(1);
  const pinchStartRef = useRef(null);
  const pinchDistRef = useRef(0);
  const lastTapRef = useRef(0);

  const cycleFit = useCallback(() => {
    setFitMode(prev => {
      const next = FIT_MODES[(FIT_MODES.indexOf(prev) + 1) % FIT_MODES.length];
      return next;
    });
    setPinchScale(1);
    try { resetControlsTimerRef.current(); } catch {}
  }, []);

  // Pinch-to-zoom handlers
  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinchStartRef.current = pinchScale || 1;
      pinchDistRef.current = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
    }
  }, [pinchScale]);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 2) return;
    const [a, b] = e.touches;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    // Late-start tolerance: some devices/CDPs deliver touchstart with 1 finger
    // then add the second. If pinch wasn't armed at start, arm it now using
    // the current distance as baseline (first move sets the origin).
    if (!pinchStartRef.current || pinchDistRef.current === 0) {
      // Late-arm: second finger arrived after touchstart. Use current spread
      // as baseline but apply an immediate 1.15x step so the user sees
      // instant feedback instead of nothing on the first move.
      pinchStartRef.current = 1.15;
      pinchDistRef.current = dist;
      setPinchScale(1.15);
      return;
    }
    let scale = pinchStartRef.current * (dist / pinchDistRef.current);
    scale = Math.min(4, Math.max(1, scale));
    setPinchScale(scale);
  }, []);

  const onTouchEnd = useCallback(() => {
    pinchStartRef.current = null;
    pinchDistRef.current = 0;
    // Snap back to 1x when close, otherwise keep zoom and switch to fill behavior
    if (pinchScale < 1.08) {
      setPinchScale(1);
    }
    try { resetControlsTimerRef.current(); } catch {}
  }, [pinchScale]);

  // Double-tap to cycle fit mode (single tap still toggles play via onClick)
  const handleVideoTouch = useCallback((e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // double tap
      e.preventDefault();
      e.stopPropagation();
      cycleFit();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [cycleFit]);

  const videoTransform = pinchScale > 1
    ? `scale(${pinchScale})`
    : 'none';


  const isLive = Boolean(item?.is_live || item?.type === 'live' || item?.year === 'LIVE');
  const sources = useMemo(() => {
    return generateUniversalServers({
      ...item,
      players: [
        ...(item?.players || item?.player || []),
        ...(server ? [server] : [])
      ]
    });
  }, [item, server]);
  const activeSource = sources[sourceIndex];

  const [autoFailoverMsg, setAutoFailoverMsg] = useState(null);

  // Auto-dismiss Controls Timer (3 seconds inactivity)
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);

    // Only auto-dismiss if video is playing and settings drawers are closed
    controlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !showSettings) {
        setShowControls(false);
      }
    }, AUTO_DISMISS_DELAY_MS);
  }, [showSettings]);
  // Keep the ref in sync so zoom handlers defined earlier can call it safely
  useEffect(() => { resetControlsTimerRef.current = resetControlsTimer; }, [resetControlsTimer]);

  const clearFailureTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const failover = useCallback((message) => {
    clearFailureTimer();
    if (sourceIndex + 1 < sources.length) {
      const nextIdx = sourceIndex + 1;
      const nextServer = sources[nextIdx];
      setAutoFailoverMsg(`⚡ Mirror ${sourceIndex + 1} busy. Auto-connecting to ${nextServer?.name || `Server ${nextIdx + 1}`}...`);
      setTimeout(() => setAutoFailoverMsg(null), 3500);
      setSourceIndex(nextIdx);
    } else {
      if (item && (item.is_live || item.type === 'live' || item.year === 'LIVE')) {
        const failedUrl = sources[sourceIndex]?.url || item.url;
        if (failedUrl) markChannelDead(failedUrl);
      }
      setBuffering(false);
      setError('Primary streams are currently busy. Select a backup mirror below:');
    }
  }, [clearFailureTimer, sourceIndex, sources]);

  const armFailureTimer = useCallback((delay, message) => {
    clearFailureTimer();
    timeoutRef.current = setTimeout(() => failover(message), delay);
  }, [clearFailureTimer, failover]);

  useEffect(() => {
    if (server && sources.length > 0) {
      const idx = sources.findIndex(s => 
        (server.id && s.id === server.id) || 
        (server.url && s.url === server.url) || 
        (server.name && s.name === server.name)
      );
      if (idx >= 0) {
        setSourceIndex(idx);
      } else {
        setSourceIndex(0);
      }
    } else {
      setSourceIndex(0);
    }
    setError('');
    // RESUME FIX: restore last watched position for this title (Continue
    // Watching). Saved by saveProgress on close; looked up by id/title.
    try {
      const progress = getWatchProgress(item);
      if (progress && progress.currentTime > 15) {
        resumePositionRef.current = progress.currentTime;
      } else {
        resumePositionRef.current = null;
      }
    } catch {
      resumePositionRef.current = null;
    }
  }, [item]);

  // ---- ORIENTATION (fix): auto-rotate to landscape when playback starts,
  // restore sensor/auto when the player closes. Uses the AndroidOrientation
  // bridge exposed by MainActivity; falls back to the Fullscreen API on
  // devices where the bridge is unavailable.
  const lockLandscape = useCallback(() => {
    try {
      if (window.AndroidOrientation?.setLandscape) { window.AndroidOrientation.setLandscape(); return; }
    } catch {}
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(() =>
          window.screen?.orientation?.lock?.('landscape').catch(() => {})
        ).catch(() => {});
      }
    } catch {}
  }, []);

  const unlockOrientation = useCallback(() => {
    try {
      if (window.AndroidOrientation?.setAuto) { window.AndroidOrientation.setAuto(); return; }
    } catch {}
    try {
      window.screen?.orientation?.unlock?.();
      if (document.fullscreenElement?.exitFullscreen) document.fullscreenElement.exitFullscreen().catch(() => {});
    } catch {}
  }, []);

  // Lock landscape as soon as the player mounts
  useEffect(() => {
    lockLandscape();
    return () => unlockOrientation();
  }, [lockLandscape, unlockOrientation]);


  const isEmbed = useMemo(() => {
    return activeSource?.type === 'embed' || activeSource?.source === 'embed' || detectStreamType(activeSource?.url) === 'embed';
  }, [activeSource]);

  useEffect(() => {
    if (isEmbed) {
      setBuffering(false);
      setPlaying(true);
      setError('');
      clearFailureTimer();
      resetControlsTimer();
      return;
    }

    const video = videoRef.current;
    if (!video || !activeSource?.url) {
      setBuffering(false);
      setError('No checked stream is available for this title.');
      return;
    }

    let disposed = false;
    retriesRef.current = 0;
    setBuffering(true);
    setError('');
    setLevels([]);
    // Startup tolerance: CDNs can take 10-15s to first segment. The failure
    // timer only fires if hls.js has NOT received ANY data (manifest parsed
    // resets it). Prevents false failovers on slow-but-working mirrors.
    armFailureTimer(STARTUP_TIMEOUT_MS, 'The stream took too long to start.');

    const startPlayback = () => {
      video.play().then(() => {
        if (!disposed) {
          setPlaying(true);
          setBuffering(false);
          clearFailureTimer();
          resetControlsTimer();
        }
      }).catch(() => {
        if (!disposed) setPlaying(false);
      });
    };

    const type = detectStreamType(activeSource.url, activeSource.type || activeSource.source);

    if (type === 'hls' && (activeSource.url.includes('.m3u8') || activeSource.url.includes('.m3u') || activeSource.type === 'hls' || activeSource.source === 'hls')) {
      (async () => {
        // v3.3.1: hls.js is a lazy chunk — fetched only when a stream needs it.
        const Hls = (await import('hls.js')).default;
        const videoNow = videoRef.current;
        if (disposed || !videoNow || videoNow !== video) return;
        if (!Hls.isSupported()) {
          onError(new Error('HLS unsupported'));
          return;
        }

        // Use optimized HLS config based on content type
        const hlsConfig = isLive
          ? getLiveConfig(activeSource.headers || {})
          : getVodConfig(activeSource.headers || {});

        const hls = new Hls(hlsConfig);
        hlsRef.current = hls;
        hls.loadSource(activeSource.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          if (disposed) return;
          setLevels(data.levels.map((lvl, index) => ({ index, label: `${lvl.height || 720}p` })));
          // Manifest arrived = mirror is alive. Cancel the startup failover so
          // slow segment loads don't trigger a false "took too long" switch.
          clearFailureTimer();
          // RESUME: jump to last watched position before starting playback
          if (resumePositionRef.current && Number.isFinite(resumePositionRef.current)) {
            try { video.currentTime = resumePositionRef.current; } catch {}
            resumePositionRef.current = null;
          }
          startPlayback();
        });
        // Enhanced error handler with auto-failover on 403/404
        hls.on(Hls.Events.ERROR, createErrorHandler(hls, (msg) => {
          if (disposed) return;
          // Fallback to Native Player first
          try {
            hls.destroy();
            hlsRef.current = null;
            video.src = activeSource.url;
            video.load();
            startPlayback();
          } catch {
            failover(msg || 'Stream playback error encountered.');
          }
        }, retriesRef));
      })();
    } else {
      video.src = activeSource.url;
      video.load();
      // RESUME for non-HLS (mp4 etc): seek once metadata is known
      if (resumePositionRef.current) {
        const rp = resumePositionRef.current;
        const onMeta = () => {
          try { video.currentTime = rp; } catch {}
          resumePositionRef.current = null;
          video.removeEventListener('loadedmetadata', onMeta);
        };
        video.addEventListener('loadedmetadata', onMeta);
      }
      startPlayback();
    }

    const onWaiting = () => {
      setBuffering(true);
      armFailureTimer(REBUFFER_TIMEOUT_MS, 'Playback stalled.');
    };
    const onPlaying = () => {
      setPlaying(true);
      setBuffering(false);
      setError('');
      noStartSinceRef.current = 0;
      frameStallSinceRef.current = 0;
      clearFailureTimer();
    };
    const onPause = () => {
      setPlaying(false);
      setShowControls(true);
      if (!isLive && video.currentTime > 5 && video.duration > 0) {
        saveProgress(item, video.currentTime, video.duration);
      }
    };
    const onError = () => failover('The device could not play this source.');
    const onTime = () => {
      setTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      if (video.buffered && video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
      // PROGRESS = ALIVE: any timeupdate while stalled means data is flowing.
      // Reset the rebuffer failover so slow-but-moving streams never get
      // killed and dumped into the Recovery modal.
      if (!video.paused) clearFailureTimer();

      // ---- v3.2.0 FRAME-TRUTH WATCHDOG (fixes ">1min stuck" modal hang) ----
      // play() resolving or timeupdate firing is NOT proof of video. The
      // playback clock can tick on audio alone while the video plane shows a
      // frozen frame forever. Watch DECODED-FRAME COUNTS instead (wall-clock
      // based; timeupdate fires ~4x/sec so tick counting would be 4x fast):
      const now = Date.now();
      const frames =
        (typeof video.getVideoPlaybackQuality === 'function'
          ? video.getVideoPlaybackQuality().totalVideoFrames
          : (video.webkitDecodedFrameCount ?? 0)) || 0;
      const hasEverRendered = frames > 0;

      if (!hasEverRendered && !isLive && video.duration > 0 && video.readyState < 2) {
        // VOD that never decoded its first frame — give it 12s, then fail over.
        if (!noStartSinceRef.current) noStartSinceRef.current = now;
        else if (now - noStartSinceRef.current >= 12000) {
          noStartSinceRef.current = 0;
          failover('This source never produced video.');
          return;
        }
      } else {
        noStartSinceRef.current = 0;
      }

      if (!video.paused && hasEverRendered) {
        frameStallSinceRef.current = 0;
      } else if (!video.paused) {
        // Playing per the clock but zero rendered frames: the exact "frozen
        // picture, audio continues" case. 6s → failover instead of hanging.
        if (!frameStallSinceRef.current) frameStallSinceRef.current = now;
        else if (now - frameStallSinceRef.current >= 6000) {
          frameStallSinceRef.current = 0;
          failover('Video froze while audio continued.');
          return;
        }
      }

      if (!isLive && video.duration > 0 && Math.floor(video.currentTime) % 5 === 0) {
        saveProgress(item, video.currentTime, video.duration);
      }
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);
    video.addEventListener('timeupdate', onTime);

    return () => {
      disposed = true;
      clearFailureTimer();
      if (!isLive && video.currentTime > 5 && video.duration > 0) {
        saveProgress(item, video.currentTime, video.duration);
      }
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
      video.removeEventListener('timeupdate', onTime);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [activeSource?.url, isLive, item]);

  const close = useCallback(() => {
    if (!isLive && duration > 0) saveProgress(item, time, duration);
    onClose?.(time, duration);
  }, [duration, isLive, item, onClose, time]);

  const togglePlay = () => {
    resetControlsTimer();
    const video = videoRef.current;
    if (!video) return;
    // LIVE channels never pause — a tap just toggles the controls overlay.
    // Pausing a live stream makes no sense (you'd fall behind the broadcast).
    if (isLive) {
      setShowControls(prev => !prev);
      return;
    }
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const seekRelative = (delta) => {
    resetControlsTimer();
    const video = videoRef.current;
    if (!video || isLive) return;
    const target = Math.max(0, Math.min(duration || Infinity, (video.currentTime || 0) + delta));
    video.currentTime = target;
    setTime(target);

    setSeekFeedback(delta > 0 ? `+${delta}s` : `${delta}s`);
    setTimeout(() => setSeekFeedback(null), 600);
  };

  const handleScrubberClick = (e) => {
    resetControlsTimer();
    const video = videoRef.current;
    if (!video || isLive || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * duration;
    video.currentTime = target;
    setTime(target);
  };

  const chooseLevel = (value) => {
    setLevel(value);
    if (hlsRef.current) hlsRef.current.currentLevel = value;
    setShowSettings(false);
    resetControlsTimer();
  };

  const chooseSource = (idx) => {
    setSourceIndex(idx);
    setShowSettings(false);
    resetControlsTimer();
  };

  const handleCastFromPlayer = () => {
    resetControlsTimer();
    castEngine.castMedia(item, {
      server: activeSource,
      startPosition: Math.floor(time) || 0
    }).catch(() => {});
    setCastSuccess(true);
    setTimeout(() => setCastSuccess(false), 3000);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (!showControls) {
        event.preventDefault();
        event.stopPropagation();
        resetControlsTimer();
        return;
      }
      resetControlsTimer();

      if (event.key === 'Escape' || event.key === 'GoBack' || event.key === 'Backspace') {
        event.preventDefault();
        if (showSettings) setShowSettings(false);
        else close();
      } else if (event.key === 'Enter' || event.key === ' ') {
        if (!document.activeElement || document.activeElement === document.body || document.activeElement.tagName === 'VIDEO') {
          event.preventDefault();
          togglePlay();
        }
      } else if (!isLive && event.key === 'ArrowRight') {
        event.preventDefault();
        seekRelative(10);
      } else if (!isLive && event.key === 'ArrowLeft') {
        event.preventDefault();
        seekRelative(-10);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [showControls, showSettings, close, duration, isLive, resetControlsTimer]);

  const progressPercent = duration > 0 ? (time / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div 
      className="tv-player-container" 
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
      style={{ 
        position: 'fixed', 
        inset: 0, 
        zIndex: 10000, 
        background: '#000',
        cursor: showControls ? 'default' : 'none',
        overflow: 'hidden'
      }}
    >
      {isEmbed ? (
        <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000', zIndex: 1 }}>
          <iframe
            src={activeSource.url}
            title={item?.title || 'Player'}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope"
            allowFullScreen
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#000',
              position: 'absolute',
              inset: 0
            }}
          />
        </div>
      ) : (
        <video 
          ref={videoRef} 
          playsInline 
          poster={playing ? undefined : (item?.backdrop_url || item?.poster_url || item?.poster || '')} 
          style={{
            width: '100%',
            height: '100%',
            objectFit: pinchScale > 1 ? 'cover' : fitMode === 'clean' ? 'contain' : fitMode,
            transform: pinchScale > 1 ? videoTransform : fitMode === 'clean' ? 'scale(1.02)' : 'none',
            clipPath: fitMode === 'clean' && pinchScale === 1 ? 'inset(3px 0 0 0)' : 'none',
            transition: 'transform 0.15s ease-out',
            backgroundColor: '#000000',
            touchAction: 'none'
          }} 
          onClick={togglePlay}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchStartCapture={handleVideoTouch}
        />
      )}

      {/* Fit mode indicator (brief toast when cycling) */}
      {fitMode !== 'contain' && pinchScale === 1 && (
        <div style={{
          position: 'absolute',
          bottom: '84px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(56, 189, 248, 0.5)',
          color: '#38bdf8',
          padding: '6px 14px',
          borderRadius: 16,
          fontSize: 12,
          fontWeight: 800,
          pointerEvents: 'none'
        }}>
          {fitMode === 'clean' ? '✨ Clean (No Lines)' : fitMode === 'cover' ? '🔍 Zoom to Fill' : '📐 Stretch'}
        </div>
      )}
      {pinchScale > 1 && (
        <div style={{
          position: 'absolute',
          bottom: '84px',
          right: '16px',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(56, 189, 248, 0.5)',
          color: '#38bdf8',
          padding: '6px 12px',
          borderRadius: 16,
          fontSize: 12,
          fontWeight: 800,
          pointerEvents: 'none'
        }}>
          🔍 {Math.round(pinchScale * 100)}%
        </div>
      )}

      {/* Auto-Failover Live Toast HUD */}
      {autoFailoverMsg && (
        <div style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1.5px solid #38bdf8',
          borderRadius: '24px',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 95,
          boxShadow: '0 12px 30px rgba(0,0,0,0.8)',
          maxWidth: '90%'
        }}>
          <Loader2 className="spin-animation" size={16} color="#38bdf8" />
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {autoFailoverMsg}
          </span>
        </div>
      )}

      {/* Seek Ripple Feedback */}
      {seekFeedback && (
        <div className={`seek-ripple-box ${seekFeedback.startsWith('+') ? 'seek-ripple-right' : 'seek-ripple-left'}`}>
          {seekFeedback.startsWith('+') ? <FastForward size={32} color="#38bdf8" /> : <Rewind size={32} color="#38bdf8" />}
          <span style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>{seekFeedback}</span>
        </div>
      )}

      {/* Center Buffering Spinner */}
      {buffering && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(15, 23, 42, 0.85)',
          padding: '16px 24px',
          borderRadius: '16px',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          zIndex: 80,
          pointerEvents: 'none'
        }}>
          <Loader2 className="spin-animation" size={32} color="#38bdf8" />
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>
            {activeSource?.name ? `Connecting to ${activeSource.name}...` : 'Loading stream...'}
          </span>
        </div>
      )}

      {/* Stream Recovery Center */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1.5px solid rgba(56, 189, 248, 0.5)',
          borderRadius: '20px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
          zIndex: 90,
          boxShadow: '0 16px 40px rgba(0,0,0,0.9)',
          maxWidth: '440px',
          width: '90%',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#38bdf8' }}>
            ⚡ Smart Stream Recovery
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>
            {error}
          </span>

          {/* Server Mirror Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxHeight: '180px', overflowY: 'auto' }}>
            {sources.map((src, idx) => (
              <button
                key={src.id || idx}
                onClick={() => {
                  setError('');
                  setBuffering(true);
                  setSourceIndex(idx);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: sourceIndex === idx ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                  border: sourceIndex === idx ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <span>{src.name || `Mirror ${idx + 1}`}</span>
                {sourceIndex === idx ? <Check size={14} color="#38bdf8" /> : <span style={{ fontSize: '10px', color: '#94a3b8' }}>Connect</span>}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px', width: '100%', justifyContent: 'center' }}>
            <button
              className="player-btn"
              onClick={() => {
                setError('');
                setBuffering(true);
                setSourceIndex(0);
              }}
              style={{ borderRadius: '10px', width: 'auto', padding: '0 16px', fontSize: '12px', fontWeight: 800, background: '#38bdf8', color: '#06090e' }}
            >
              Retry Primary
            </button>
            <button
              className="player-btn"
              onClick={close}
              style={{ borderRadius: '10px', width: 'auto', padding: '0 16px', fontSize: '12px', fontWeight: 800 }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Auto-Dismissing OSD Controls */}
      <div
        className={`player-osd ${showControls ? 'is-visible' : 'is-hidden'}`}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '20px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 35%, transparent 60%, rgba(0,0,0,0.85) 100%)',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          // PINCH FIX: the overlay must never swallow touches meant for the
          // video. Only the top/bottom bars (buttons) capture; the middle
          // region passes gestures (pinch/double-tap) through to the video.
          pointerEvents: 'none'
        }}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button 
              className="player-btn" 
              onClick={close} 
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '16px' }}>{item?.title_en || item?.title || 'Playback'}</strong>
                {isLive && (
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 900, padding: '2px 6px', borderRadius: '4px' }}>
                    LIVE
                  </span>
                )}
              </div>
              <div style={{ opacity: 0.75, fontSize: '12px', marginTop: '2px' }}>
                {activeSource?.name || 'Fast Server'} • {item?.category || (isLive ? 'Live TV' : (item?.year || '2026'))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              className="player-btn" 
              onClick={handleCastFromPlayer}
              style={{ 
                minWidth: 44, 
                minHeight: 44, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                background: castSuccess ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.12)', 
                color: '#38bdf8' 
              }}
              title="Cast to TV"
            >
              <Cast size={20} />
            </button>

            <button
              className={`player-btn ${showSettings ? 'is-focused' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Stream Settings"
            >
              <Settings2 size={20} />
            </button>

            {/* CATCH-UP TV button — only for live channels */}
            {isLive && (
              <button
                className={`player-btn ${showCatchup ? 'is-focused' : ''}`}
                onClick={() => setShowCatchup(!showCatchup)}
                style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Catch-Up TV — watch past programmes"
              >
                <History size={20} />
              </button>
            )}

            {/* Manual rotate toggle (fix): flips landscape/portrait on demand */}
            <button
              className="player-btn"
              onClick={() => {
                try {
                  if (window.AndroidOrientation?.setPortrait) {
                    window.AndroidOrientation.setPortrait();
                    // Toggle back to landscape on next tap via state flip below
                    rotateFlippedRef.current = !rotateFlippedRef.current;
                    if (!rotateFlippedRef.current) window.AndroidOrientation.setLandscape();
                  } else {
                    window.screen?.orientation?.unlock?.();
                  }
                } catch {}
              }}
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Rotate Screen"
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>

        {/* Bottom Controls Bar */}
        <div style={{ pointerEvents: 'auto' }}>
          {/* VOD Scrubber Track */}
          {!isLive && (
            <div 
              className="player-scrubber-track"
              onClick={handleScrubberClick}
              style={{ 
                position: 'relative', 
                height: '6px', 
                borderRadius: '3px', 
                background: 'rgba(255, 255, 255, 0.25)', 
                cursor: 'pointer',
                marginBottom: '14px'
              }}
            >
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${bufferedPercent}%`,
                  background: 'rgba(255, 255, 255, 0.35)',
                  borderRadius: '3px',
                  pointerEvents: 'none'
                }}
              />
              <div 
                className="player-scrubber-fill"
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)',
                  borderRadius: '3px',
                  pointerEvents: 'none'
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button 
                className="player-btn" 
                onClick={togglePlay} 
                style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#38bdf8', color: '#06090e' }}
              >
                {playing ? <Pause size={22} fill="#06090e" /> : <Play size={22} fill="#06090e" style={{ marginLeft: '2px' }} />}
              </button>

              {!isLive && (
                <>
                  <button 
                    className="player-btn" 
                    onClick={() => seekRelative(-10)} 
                    style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Rewind 10s"
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button 
                    className="player-btn" 
                    onClick={() => seekRelative(10)} 
                    style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Forward 10s"
                  >
                    <RotateCw size={18} />
                  </button>
                </>
              )}

              <button 
                className="player-btn" 
                onClick={() => { 
                  if (videoRef.current) { 
                    videoRef.current.muted = !videoRef.current.muted; 
                    setMuted(videoRef.current.muted); 
                  } 
                }} 
                style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>

            <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>
              {isLive ? (
                <span style={{ color: '#ef4444' }}>● LIVE</span>
              ) : (
                `${formatTime(time)} / ${formatTime(duration)}`
              )}
            </span>
          </div>

          {/* CATCH-UP TV Drawer: watch past programmes on this channel */}
          {showCatchup && isLive && (
            <CatchupDrawer
              channel={item}
              onClose={() => setShowCatchup(false)}
              onPlay={(url) => {
                setShowCatchup(false);
                // swap the live stream to the catch-up (timeshift) URL
                const v = videoRef.current;
                if (v) {
                  v.src = url;
                  v.load();
                  v.play().catch(() => {});
                }
              }}
            />
          )}

          {/* Settings Drawer */}
          {showSettings && (
            <div style={{ 
              marginTop: '14px', 
              padding: '14px', 
              background: 'rgba(15, 23, 42, 0.98)', 
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '16px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.8)'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', marginBottom: '8px', textTransform: 'uppercase' }}>
                Stream Quality
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                <button 
                  onClick={() => chooseLevel(-1)} 
                  style={{ 
                    padding: '6px 12px', 
                    borderRadius: '8px', 
                    background: level === -1 ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                    color: level === -1 ? '#06090e' : '#fff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Auto
                </button>
                {levels.map(entry => (
                  <button 
                    key={entry.index} 
                    onClick={() => chooseLevel(entry.index)} 
                    style={{ 
                      padding: '6px 12px', 
                      borderRadius: '8px', 
                      background: level === entry.index ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                      color: level === entry.index ? '#06090e' : '#fff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {sources.length > 1 && (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Streaming Servers
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {sources.map((entry, index) => (
                      <button 
                        key={entry.id || index} 
                        onClick={() => chooseSource(index)} 
                        style={{ 
                          padding: '6px 12px', 
                          borderRadius: '8px', 
                          background: sourceIndex === index ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                          color: sourceIndex === index ? '#06090e' : '#fff',
                          border: 'none',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        {entry.name || `Server ${index + 1}`}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* v3.2.0: Video Fit / Zoom controls (gestures existed but were
                  undiscoverable — user reported "aspect ratio fit zoom doesnt work") */}
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', marginBottom: '8px', textTransform: 'uppercase' }}>
                Video Fit
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                {FIT_MODES.map(mode => (
                  <button
                    key={mode}
                    onClick={() => {
                      setFitMode(mode);
                      setPinchScale(1);
                      resetControlsTimer();
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: fitMode === mode && pinchScale === 1 ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                      color: fitMode === mode && pinchScale === 1 ? '#06090e' : '#fff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {mode === 'clean' ? 'Clean' : mode === 'contain' ? 'Fit' : mode === 'cover' ? 'Zoom' : 'Stretch'}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                Or pinch the video to zoom free-form • double-tap cycles modes.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

