import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  ArrowLeft, 
  Tv, 
  Server, 
  Layers,
  X,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { generateUniversalServers, isEmbedUrl } from '../utils/streamingEngines';
import {
  hasNativePlayer,
  shouldPreferNativePlayer,
  isNativePlayableUrl,
  isDirectMediaUrl,
  playInNativePlayer
} from '../utils/nativePlayer';
import { saveProgress, getWatchHistory } from '../api/history';
import { BINGE_COUNTDOWN_SECONDS } from '../utils/binge';
import './TVPlayer.css';

export function TVPlayer({
  item,
  server,
  channels = [],
  episodes = [],
  currentEpisodeIndex = 0,
  onSelectEpisode,
  onSelectChannel,
  onClose
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const osdTimerRef = useRef(null);
  const stallWatchdogRef = useRef(null);
  const resumePositionRef = useRef(null);
  const lastPositionRef = useRef(0);
  const progressSaverRef = useRef(null);
  const bingeFiredRef = useRef(false);
  const bingeCountdownRef = useRef(null);
  const blackScreenWatchdogRef = useRef(null);
  const nativeHandoffDoneRef = useRef(false);
  // Read synchronously by the pipeline effect. State alone lands one commit too
  // late, which is long enough for Hls.js to grab the decoder we just gave away.
  const nativeActiveRef = useRef(false);

  const isLive = item?.is_live || 
                 item?.type === 'live' || 
                 item?.year === 'LIVE' || 
                 item?.category === 'Live TV' || 
                 item?.category === 'Live Channels' || 
                 item?.category === 'Sports' || 
                 item?.category === 'News';

  const title = typeof item?.title_en === 'string' && item.title_en
    ? item.title_en
    : typeof item?.title === 'string' && item.title
    ? item.title
    : typeof item?.name === 'string' && item.name
    ? item.name
    : (isLive ? 'Live Channel' : 'Video Stream');

  const subtitle = isLive
    ? 'Live Broadcast'
    : (typeof item?.year === 'string' || typeof item?.year === 'number'
      ? `${item.year} • ${typeof item?.category === 'string' ? item.category : 'HD'}`
      : 'HD Stream');

  // Compute all playable servers
  const allServers = useMemo(() => {
    if (isLive) {
      const p = item?.players || item?.player;
      if (Array.isArray(p) && p.length > 0) return p;
      if (server && server.url) return [server];
      if (item?.url) return [{ id: 'live-1', name: 'Direct Live Stream', url: item.url, source: 'm3u8' }];
      return [];
    }
    return generateUniversalServers(item);
  }, [item, server, isLive]);

  // On a TV box, an iframe embed source can never render: the native player only
  // accepts real stream URLs, and the legacy WebView cannot composite MSE video.
  // So put directly playable sources first and leave the embeds at the bottom.
  const orderedServers = useMemo(() => {
    if (!shouldPreferNativePlayer() || allServers.length < 2) return allServers;
    const playable = allServers.filter((srv) => isNativePlayableUrl(srv?.url));
    if (playable.length === 0) return allServers;
    const rest = allServers.filter((srv) => !isNativePlayableUrl(srv?.url));
    return [...playable, ...rest];
  }, [allServers]);

  const [currentServerIndex, setCurrentServerIndex] = useState(0);
  const [videoEngine, setVideoEngine] = useState('hls'); // 'hls' | 'native'
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bingeCountdown, setBingeCountdown] = useState(null);
  const [showOsd, setShowOsd] = useState(true);
  const [showDrawer, setShowDrawer] = useState(null); // 'channels' | 'servers' | 'audio' | null
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [nativeActive, setNativeActive] = useState(false);

  const activeServer = orderedServers[currentServerIndex] || orderedServers[0] || server;
  const streamUrl = activeServer?.url || item?.url;

  // Wake up OSD and reset auto-hide timer
  const pingOsd = useCallback(() => {
    setShowOsd(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      if (!showDrawer) {
        setShowOsd(false);
      }
    }, 4500);
  }, [showDrawer]);

  // Initial OSD wake-up + resume lookup
  useEffect(() => {
    pingOsd();
    // RESUME FIX: look up last watched position for this title. The web
    // player seeks to it once the HLS manifest is parsed.
    try {
      const history = getWatchHistory() || [];
      const entry = history.find(h =>
        (item?.id && h.id === item.id) ||
        (h.title && item?.title && h.title === item.title)
      );
      if (entry && entry.currentTime > 15) {
        resumePositionRef.current = entry.currentTime;
      }
    } catch {}
    return () => {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    };
  }, [pingOsd]);

  // BINGE: countdown ticker — fires next episode at 0
  useEffect(() => {
    if (bingeCountdown === null) {
      if (bingeCountdownRef.current) {
        clearInterval(bingeCountdownRef.current);
        bingeCountdownRef.current = null;
      }
      return;
    }
    bingeCountdownRef.current = setInterval(() => {
      setBingeCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          const nextIdx = currentEpisodeIndex + 1;
          if (nextIdx < episodes.length && onSelectEpisode) {
            onSelectEpisode(episodes[nextIdx], nextIdx);
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(bingeCountdownRef.current);
      bingeCountdownRef.current = null;
    };
  }, [bingeCountdown, currentEpisodeIndex, episodes, onSelectEpisode]);

  // Auto failover to next server if current server fails
  const handleFailover = useCallback((reason = 'Stream connection error') => {
    if (orderedServers.length > 1 && currentServerIndex < orderedServers.length - 1) {
      const nextIdx = currentServerIndex + 1;
      const nextName = orderedServers[nextIdx]?.name || `Server ${nextIdx + 1}`;
      setErrorMessage(`⚡ ${reason}. Switching to ${nextName}...`);
      setCurrentServerIndex(nextIdx);
      setTimeout(() => setErrorMessage(null), 3000);
    } else {
      setErrorMessage('Stream offline. Please select another server or channel.');
      setIsBuffering(false);
    }
  }, [orderedServers, currentServerIndex]);

  // Toggle Video Engine (HLS.js vs Native Android HTML5 Video)
  const toggleEngine = useCallback(() => {
    const nextEngine = videoEngine === 'hls' ? 'native' : 'hls';
    setVideoEngine(nextEngine);
    setErrorMessage(`Switched Video Engine to: ${nextEngine === 'hls' ? 'HLS.js' : 'Native TV Player'}`);
    setTimeout(() => setErrorMessage(null), 2500);
  }, [videoEngine]);

  /**
   * Fully stops WebView playback and frees the video decoder.
   *
   * Fire TV boxes have a tiny MediaCodec budget. Handing a stream to the native
   * ExoPlayer activity while Hls.js still holds a decoder is how you end up with
   * audio on top of a black picture, so nothing may launch before this runs.
   */
  const teardownWebPlayback = useCallback(() => {
    if (stallWatchdogRef.current) {
      clearInterval(stallWatchdogRef.current);
      stallWatchdogRef.current = null;
    }
    if (blackScreenWatchdogRef.current) {
      clearInterval(blackScreenWatchdogRef.current);
      blackScreenWatchdogRef.current = null;
    }
    if (progressSaverRef.current) {
      clearInterval(progressSaverRef.current);
      progressSaverRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (err) {
        console.warn('Hls teardown notice:', err);
      }
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      try {
        // SAVE POSITION BEFORE teardown zeroes the element. Read it first and
        // stash it so onClose() still gets a real value after src removal.
        lastPositionRef.current = video.currentTime || 0;
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (err) {
        console.warn('Video teardown notice:', err);
      }
    }
  }, []);

  /** Single entry point for every handoff to the native hardware player. */
  const handOffToNative = useCallback((message) => {
    if (!streamUrl) return false;
    // Iframe embeds and known player pages are not streams. Launching the native
    // player with one guarantees a black screen, so refuse here.
    if (!isNativePlayableUrl(streamUrl)) return false;

    // Release the decoder first, then launch. Order matters here.
    teardownWebPlayback();

    if (!playInNativePlayer(streamUrl, title, isLive)) return false;

    nativeHandoffDoneRef.current = streamUrl;
    nativeActiveRef.current = true;
    setNativeActive(true);
    setIsBuffering(false);
    setErrorMessage(message || '▶ Opening in hardware player...');
    setTimeout(() => setErrorMessage(null), 2500);
    return true;
  }, [streamUrl, title, isLive, teardownWebPlayback]);

  const launchNativeHardwarePlayer = useCallback(() => {
    if (handOffToNative('▶ Opening in hardware player...')) return true;
    setErrorMessage(
      hasNativePlayer()
        ? 'This source cannot open in the hardware player. Try another server.'
        : 'Native Player only available on Android / Fire TV'
    );
    setTimeout(() => setErrorMessage(null), 3000);
    return false;
  }, [handOffToNative]);

  // Let the Android layer stop web playback directly before it starts the native
  // player, so the decoder is free even if the handoff came from the Java side.
  useEffect(() => {
    window.__ajoStopWebPlayback = () => teardownWebPlayback();
    return () => {
      if (window.__ajoStopWebPlayback) delete window.__ajoStopWebPlayback;
    };
  }, [teardownWebPlayback]);

  // The native player finished or the user pressed Back inside it. Close this view
  // instead of leaving a dead, black <video> element on screen.
  useEffect(() => {
    const handleNativeClosed = () => {
      if (!nativeActiveRef.current) return;
      teardownWebPlayback();
      if (onClose) {
        const video = videoRef.current;
        onClose(lastPositionRef.current || video?.currentTime || 0, video?.duration || 0);
      }
    };
    window.addEventListener('ajo-native-player-closed', handleNativeClosed);
    return () => window.removeEventListener('ajo-native-player-closed', handleNativeClosed);
  }, [onClose, teardownWebPlayback]);

  // On Fire TV / legacy Android TV WebViews, MSE video never composites over the
  // hardware plane — audio plays while the surface stays black. Hand the stream
  // straight to the native ExoPlayer activity instead of waiting for the
  // black-screen watchdog to trip 3 seconds in.
  useEffect(() => {
    if (!streamUrl) return;
    if (nativeHandoffDoneRef.current === streamUrl) return;
    if (!shouldPreferNativePlayer()) return;
    // Not a real stream URL. The embed guard below deals with it.
    if (!isNativePlayableUrl(streamUrl)) return;

    nativeHandoffDoneRef.current = streamUrl;
    handOffToNative('▶ Opening in hardware player...');
  }, [streamUrl, handOffToNative]);

  // Video & Hls.js Pipeline Setup
  useEffect(() => {
    if (!streamUrl) {
      setIsBuffering(false);
      setErrorMessage('No valid stream URL found.');
      return;
    }

    // Playback belongs to the native player now. Building the WebView pipeline
    // here would take a second decoder and black out the native surface.
    if (nativeActiveRef.current) {
      setIsBuffering(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    setIsBuffering(true);
    setErrorMessage(null);

    let hls = null;
    let lastProgressTime = 0;
    // v3.8.0: bounded fatal-error retries. Unbounded startLoad()/recoverMediaError()
    // loops kept the "Connecting..." state alive for minutes on dead CDNs.
    let networkRetryCount = 0;
    let mediaRetryCount = 0;

    const isEmbedStream = isEmbedUrl(streamUrl) || !isDirectMediaUrl(streamUrl);
    if (!isEmbedStream && videoEngine === 'hls' && Hls.isSupported() && (streamUrl.includes('.m3u8') || streamUrl.includes('/getm3u8/') || isLive || streamUrl.endsWith('.m3u8'))) {
      hls = new Hls({
        enableWorker: false,
        lowLatencyMode: isLive,
        startLevel: -1,
        capLevelToPlayerSize: true,
        backBufferLength: isLive ? 0 : 30,
        maxBufferLength: isLive ? 15 : 60,
        maxMaxBufferLength: isLive ? 30 : 120,
        maxBufferSize: 25 * 1024 * 1024,
        manifestLoadingTimeOut: 15000,
        fragLoadingTimeOut: 20000,
        highBufferWatchdogPeriod: 2,
        nudgeMaxRetry: 6,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        setIsBuffering(false);
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          setAudioTracks(hls.audioTracks.map((t, idx) => ({
            id: idx,
            label: t.name || t.lang || `Track ${idx + 1}`
          })));
        }
        video.play().then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
          // RESUME: seek after play() resolves — seeking before play on a
          // fresh hls.js attachment gets reset when the player initializes.
          if (resumePositionRef.current) {
            try {
              video.currentTime = resumePositionRef.current;
            } catch {}
            resumePositionRef.current = null;
          }
        }).catch(err => {
          console.warn('TV Autoplay notification:', err);
        });
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        // RESUME fallback: first segment delivered = playback is real. Apply
        // saved position here too, in case play() was blocked/pending when
        // MANIFEST_PARSED fired.
        if (resumePositionRef.current) {
          try {
            const v = videoRef.current;
            if (v) v.currentTime = resumePositionRef.current;
          } catch {}
          resumePositionRef.current = null;
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
        setCurrentAudio(data.id);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // v3.8.0: max 2 retries, then fail over. Previously retried forever.
              if (networkRetryCount < 2) {
                networkRetryCount += 1;
                hls.startLoad();
              } else if (!handOffToNative('Network stalled, switching to hardware player...')) {
                hls.destroy();
                hlsRef.current = null;
                handleFailover('Stream connection failed');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (mediaRetryCount < 2) {
                mediaRetryCount += 1;
                hls.recoverMediaError();
                if (video && video.paused) video.play().catch(() => {});
              } else if (!handOffToNative('Playback error, switching to hardware player...')) {
                hls.destroy();
                hlsRef.current = null;
                handleFailover('Stream engine failed');
              }
              break;
            default:
              // v3.9.3: previously the default branch silently destroyed the
              // Hls instance and called handleFailover with no message. Now
              // we route it through the same native-handoff path used by the
              // known error types above, which gives the user a clear toast.
              if (!handOffToNative('Stream engine error, switching to hardware player...')) {
                hls.destroy();
                hlsRef.current = null;
                handleFailover('Stream engine error');
              }
              break;
          }
        }
      });

      // 24/7 Anti-Stall watchdog timer
      stallWatchdogRef.current = setInterval(() => {
        if (video && !video.paused && video.readyState >= 2) {
          if (video.currentTime === lastProgressTime && isLive) {
            hls?.recoverMediaError();
            video.play().catch(() => {});
          }
          lastProgressTime = video.currentTime;
        }
      }, 4000);

    } else {
      // Native Android HTML5 video playback
      video.src = streamUrl;
      video.play().then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
      }).catch(err => console.warn(err));
    }

    // Periodic progress save (every 10s) so Continue Watching is accurate
    // even if the app crashes or power dies mid-watch.
    progressSaverRef.current = setInterval(() => {
      try {
        // Save even when paused — user pauses then closes the app; that's
        // exactly the position Continue Watching must restore.
        if (video.currentTime > 5 && video.duration > 0) {
          saveProgress(item, video.currentTime, video.duration);
        }
      } catch {}
    }, 10000);

    // Black Screen Detection & Auto-Recovery Watchdog:
    // If audio is progressing (currentTime advancing) but the video plane never
    // reports dimensions / decoded frames, the WebView compositor is painting
    // opaque black over the hardware video surface. Hand off to the native
    // ExoPlayer activity. Polls instead of firing once, because on a cold Fire TV
    // the first segment can take longer than 3s to decode.
    let blackScreenChecks = 0;
    blackScreenWatchdogRef.current = setInterval(() => {
      if (!video || nativeActiveRef.current || nativeHandoffDoneRef.current === streamUrl) return;
      blackScreenChecks += 1;

      const advancing = !video.paused && video.currentTime > 1;
      const noVideoPlane = video.videoWidth === 0 || video.videoHeight === 0;
      // decoded-frame counters where the browser exposes them
      const decodedFrames =
        (typeof video.getVideoPlaybackQuality === 'function'
          ? video.getVideoPlaybackQuality().totalVideoFrames
          : video.webkitDecodedFrameCount) ?? null;
      const noFrames = decodedFrames !== null && decodedFrames === 0;

      if (advancing && (noVideoPlane || noFrames)) {
        console.warn('Black screen detected in WebView, handing off to native hardware player');
        const watchdog = blackScreenWatchdogRef.current;
        if (!handOffToNative('Black screen detected, switching to hardware player...')) {
          // Cannot hand off (not a real stream URL, or not an Android build).
          // Try the next source rather than staring at a black screen.
          nativeHandoffDoneRef.current = streamUrl;
          handleFailover('Video not rendering');
        }
        if (watchdog) clearInterval(watchdog);
        return;
      }

      // Stop polling once we have a healthy picture, or after ~15s.
      if ((advancing && !noVideoPlane) || blackScreenChecks > 10) {
        clearInterval(blackScreenWatchdogRef.current);
      }
    }, 1500);

    return () => {
      if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
      if (blackScreenWatchdogRef.current) clearInterval(blackScreenWatchdogRef.current);
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [streamUrl, isLive, videoEngine, nativeActive, handOffToNative, handleFailover]);

  // Embed guard. Declared after the pipeline effect on purpose, so this message
  // survives the setErrorMessage(null) that the pipeline does on start.
  // v3.8.2: embed mirrors now render in the WebView iframe fallback (like the
  // phone app) instead of erroring. The hard "not supported" error only fires
  // when the CURRENT server is unusable AND no other server in the queue is
  // either native-playable or an embed we can iframe.
  useEffect(() => {
    if (!streamUrl) return;
    if (!shouldPreferNativePlayer()) return;
    if (isNativePlayableUrl(streamUrl)) return;

    const nextPlayable = orderedServers.findIndex(
      (srv, idx) => idx > currentServerIndex && isNativePlayableUrl(srv?.url)
    );

    if (nextPlayable !== -1) {
      setErrorMessage('This source cannot play on TV. Switching server...');
      setCurrentServerIndex(nextPlayable);
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    // Current source is an embed and no native-playable mirror remains.
    // The WebView iframe fallback below renders it — don't kill playback.
    setIsBuffering(false);
    setErrorMessage('▶ Opening in web player...');
    const t = setTimeout(() => setErrorMessage(null), 2500);
    return () => clearTimeout(t);
  }, [streamUrl, orderedServers, currentServerIndex]);

  // Video Time Update & Progress
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isLive) return;
    setCurrentTime(video.currentTime);
    setDuration(video.duration || 0);

    // BINGE AUTO-ADVANCE: near the end of a multi-episode title, show a
    // countdown; at 0, jump to the next episode automatically.
    if (episodes.length > 1 && onSelectEpisode && video.duration > 0) {
      const left = video.duration - video.currentTime;
      if (left <= BINGE_COUNTDOWN_SECONDS && !bingeFiredRef.current) {
        bingeFiredRef.current = true;
        setBingeCountdown(BINGE_COUNTDOWN_SECONDS);
      }
      if (bingeCountdownRef.current !== null && left > BINGE_COUNTDOWN_SECONDS + 5) {
        // user seeked backwards out of the window — cancel
        bingeFiredRef.current = false;
        setBingeCountdown(null);
        bingeCountdownRef.current = null;
      }
    }
  }, [isLive, episodes, onSelectEpisode]);

  // Play / Pause Toggle
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
    pingOsd();
  }, [pingOsd]);

  // Seeking Forward / Backward
  const handleSeek = useCallback((deltaSeconds) => {
    const video = videoRef.current;
    if (!video || isLive) return;
    const newTime = Math.max(0, Math.min(video.currentTime + deltaSeconds, video.duration || 0));
    video.currentTime = newTime;
    setCurrentTime(newTime);
    pingOsd();
  }, [isLive, pingOsd]);

  // Audio Track Switcher
  const handleSwitchAudio = useCallback((trackId) => {
    if (hlsRef.current && hlsRef.current.audioTracks.length > trackId) {
      hlsRef.current.audioTrack = trackId;
      setCurrentAudio(trackId);
      setShowDrawer(null);
      pingOsd();
    }
  }, [pingOsd]);

  // TV Remote KeyDown Controller
  useEffect(() => {
    const handleKeyDown = (e) => {
      pingOsd();

      const key = e.key;
      const keyCode = e.keyCode;

      // Back key exits player cleanly
      if (key === 'Escape' || key === 'Backspace' || keyCode === 4 || keyCode === 27 || keyCode === 8) {
        e.preventDefault();
        e.stopPropagation();
        if (showDrawer) {
          setShowDrawer(null);
          return;
        }
        if (onClose) {
          const video = videoRef.current;
          teardownWebPlayback();
          onClose(lastPositionRef.current || video?.currentTime || 0, video?.duration || 0);
        }
        return;
      }

      // Enter/OK key: if drawer is closed, toggle play/pause or focus controls
      if ((key === 'Enter' || keyCode === 13 || keyCode === 23) && !showDrawer) {
        if (!document.activeElement || document.activeElement === document.body) {
          togglePlayPause();
        }
      }

      // Left / Right keys for seeking
      if (!showDrawer && !isLive) {
        if (key === 'ArrowLeft' || keyCode === 21 || keyCode === 37) {
          handleSeek(-10);
        } else if (key === 'ArrowRight' || keyCode === 22 || keyCode === 39) {
          handleSeek(10);
        }
      }

      // Up / Down key quick drawers. Only hijack when the OSD is visible,
      // otherwise let the spatial-nav system scroll the live rail.
      if (showOsd && (key === 'ArrowDown' || keyCode === 20 || keyCode === 40)) {
        if (!showDrawer && isLive && channels.length > 0) {
          setShowDrawer('channels');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pingOsd, showDrawer, onClose, isLive, channels, togglePlayPause, handleSeek, teardownWebPlayback]);

  // Format MM:SS helper
  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="tv-player-fullscreen"
      onClick={pingOsd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        background: '#000',
        overflow: 'hidden',
        zIndex: 2000
      }}
    >
      <video
        ref={videoRef}
        className="tv-player-video"
        playsInline
        autoPlay
        controls={false}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: 'transparent',
          background: 'transparent'
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* WEBVIEW EMBED FALLBACK: embed mirrors render in an iframe on web fallback */}
      {streamUrl && !nativeActive && (isEmbedUrl(streamUrl) || !isDirectMediaUrl(streamUrl)) && (
        <iframe
          src={streamUrl}
          title={title || 'Stream'}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            background: '#000',
            zIndex: 10
          }}
        />
      )}

      {/* Buffering Spinner */}
      {isBuffering && (
        <div
          className="tv-center-state"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 80
          }}
        >
          <div className="tv-spinner" />
          <p style={{ fontWeight: 700, color: '#38bdf8', marginTop: 12 }}>Buffering Stream...</p>
        </div>
      )}

      {/* Error Message Toast */}
      {errorMessage && (
        <div style={{
          position: 'absolute',
          top: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(239, 68, 68, 0.95)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: 9999,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 200,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
        }}>
          <AlertCircle size={20} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* BINGE AUTO-ADVANCE overlay: countdown to next episode.
          Sits above everything, doesn't block the picture. */}
      {bingeCountdown !== null && episodes[currentEpisodeIndex + 1] && (
        <div style={{
          position: 'absolute',
          bottom: '140px',
          right: '48px',
          zIndex: 96,
          background: 'rgba(10, 14, 24, 0.94)',
          border: '1px solid rgba(56, 189, 248, 0.45)',
          borderRadius: '14px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 12px 36px rgba(0,0,0,0.7)'
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.5px' }}>
              UP NEXT IN {bingeCountdown}s
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff', marginTop: '4px', maxWidth: '320px' }}>
              {episodes[currentEpisodeIndex + 1].title || `Episode ${currentEpisodeIndex + 2}`}
            </div>
          </div>
          <button
            onClick={() => { setBingeCountdown(null); bingeFiredRef.current = false; }}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '8px',
              color: '#e2e8f0',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* On-Screen Display (OSD) Overlay.
          Geometry is inline on purpose: this must never become a full-screen dark
          layer over the picture, and it must not depend on a CSS class existing. */}
      {showOsd && (
        <div
          className="tv-player-osd"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'transparent',
            pointerEvents: 'none',
            zIndex: 60
          }}
        >
          {/* Top Bar */}
          <div
            className="tv-player-osd-top"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
              padding: '28px 40px 56px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
              pointerEvents: 'auto'
            }}
          >
            <div className="tv-player-osd-title-box">
              <h1 className="tv-player-title">{title}</h1>
              <p className="tv-player-subtitle">{subtitle} • {activeServer?.name || 'Server 1'} ({nativeActive ? 'Hardware Player' : videoEngine === 'hls' ? 'HLS Engine' : 'Native Engine'})</p>
            </div>

            <button 
              className="tv-player-btn"
              tabIndex={0}
              onClick={() => {
                teardownWebPlayback();
                if (onClose) onClose(videoRef.current?.currentTime || 0, videoRef.current?.duration || 0);
              }}
            >
              <ArrowLeft size={18} />
              <span>Back (Return)</span>
            </button>
          </div>

          {/* Bottom Controls Bar */}
          <div
            className="tv-player-osd-bottom"
            style={{
              padding: '56px 40px 28px',
              background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)',
              pointerEvents: 'auto'
            }}
          >
            {!isLive && duration > 0 && (
              <div className="tv-player-progress-row">
                <span className="tv-player-time">{formatTime(currentTime)}</span>
                <div className="tv-player-progress-bar">
                  <div 
                    className="tv-player-progress-fill" 
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <span className="tv-player-time">{formatTime(duration)}</span>
              </div>
            )}

            <div className="tv-player-controls-row">
              <div
                className="tv-player-controls-group"
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}
              >
                <button className="tv-player-btn" tabIndex={0} onClick={togglePlayPause}>
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                {!isLive && (
                  <>
                    <button className="tv-player-btn" tabIndex={0} onClick={() => handleSeek(-10)}>
                      <RotateCcw size={18} />
                      <span>-10s</span>
                    </button>
                    <button className="tv-player-btn" tabIndex={0} onClick={() => handleSeek(10)}>
                      <RotateCw size={18} />
                      <span>+10s</span>
                    </button>
                  </>
                )}

                {orderedServers.length > 1 && (
                  <button 
                    className="tv-player-btn" 
                    tabIndex={0}
                    onClick={() => setShowDrawer(showDrawer === 'servers' ? null : 'servers')}
                  >
                    <Server size={18} />
                    <span>Servers ({currentServerIndex + 1}/{orderedServers.length})</span>
                  </button>
                )}

                {hasNativePlayer() && (
                  <button 
                    className="tv-player-btn" 
                    tabIndex={0}
                    onClick={launchNativeHardwarePlayer}
                    style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)', color: '#000', fontWeight: 800 }}
                  >
                    <Tv size={18} />
                    <span>Hardware Player</span>
                  </button>
                )}

                <button 
                  className="tv-player-btn" 
                  tabIndex={0}
                  onClick={toggleEngine}
                >
                  <RefreshCw size={18} />
                  <span>Engine: {videoEngine === 'hls' ? 'HLS' : 'Native'}</span>
                </button>

                {audioTracks.length > 1 && (
                  <button 
                    className="tv-player-btn" 
                    tabIndex={0}
                    onClick={() => setShowDrawer(showDrawer === 'audio' ? null : 'audio')}
                  >
                    <Volume2 size={18} />
                    <span>Audio ({audioTracks[currentAudio]?.label || 'Default'})</span>
                  </button>
                )}

                {isLive && channels.length > 0 && (
                  <button 
                    className="tv-player-btn" 
                    tabIndex={0}
                    onClick={() => setShowDrawer(showDrawer === 'channels' ? null : 'channels')}
                  >
                    <Tv size={18} />
                    <span>Channels Guide</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Side Quick Drawer: Channels / Servers / Audio */}
      {showDrawer && (
        <div
          className="tv-player-drawer"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 420,
            maxWidth: '45%',
            padding: 20,
            background: 'rgba(2, 6, 23, 0.96)',
            overflowY: 'auto',
            zIndex: 120
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
              {showDrawer === 'channels' && '📺 Live Channels'}
              {showDrawer === 'servers' && '⚡ Select Server'}
              {showDrawer === 'audio' && '🔊 Audio Tracks'}
            </h3>
            <button 
              className="tv-player-btn" 
              tabIndex={0}
              onClick={() => setShowDrawer(null)}
              style={{ padding: '6px 10px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Channels List */}
          {showDrawer === 'channels' && channels.map((ch, idx) => (
            <button
              key={ch.id || idx}
              tabIndex={0}
              className={`tv-drawer-item ${ch.id === item?.id ? 'active' : ''}`}
              onClick={() => {
                if (onSelectChannel) onSelectChannel(ch);
                setShowDrawer(null);
              }}
            >
              <span>{ch.title || ch.name}</span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{ch.category || 'Live'}</span>
            </button>
          ))}

          {/* Servers List */}
          {showDrawer === 'servers' && orderedServers.map((srv, idx) => {
            const tvUnsupported = shouldPreferNativePlayer() && !isNativePlayableUrl(srv?.url);
            return (
              <button
                key={srv.id || idx}
                tabIndex={0}
                className={`tv-drawer-item ${idx === currentServerIndex ? 'active' : ''}`}
                onClick={() => {
                  setCurrentServerIndex(idx);
                  setShowDrawer(null);
                  pingOsd();
                }}
              >
                <span>{srv.name || `Server ${idx + 1}`}</span>
                <span style={{ fontSize: '0.75rem', color: tvUnsupported ? '#f59e0b' : '#38bdf8' }}>
                  {tvUnsupported ? 'Not supported on TV' : (srv.source?.toUpperCase() || 'HLS')}
                </span>
              </button>
            );
          })}

          {/* Audio Tracks List */}
          {showDrawer === 'audio' && audioTracks.map((trk) => (
            <button
              key={trk.id}
              tabIndex={0}
              className={`tv-drawer-item ${trk.id === currentAudio ? 'active' : ''}`}
              onClick={() => handleSwitchAudio(trk.id)}
            >
              <span>{trk.label}</span>
              {trk.id === currentAudio && <span style={{ color: '#38bdf8' }}>✓ Active</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
