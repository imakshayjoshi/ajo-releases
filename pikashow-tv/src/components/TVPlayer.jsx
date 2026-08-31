import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  RefreshCw,
  Maximize,
  Radio
} from 'lucide-react';
import { generateUniversalServers, isEmbedUrl } from '../utils/streamingEngines';
import { getCurrentAndNextProgram } from '../api/epg';
import {
  hasNativePlayer,
  shouldPreferNativePlayer,
  isNativePlayableUrl,
  isDirectMediaUrl,
  playInNativePlayer,
  preflightEmbedUrl
} from '../utils/nativePlayer';
import { saveProgress, getWatchHistory, getWatchProgress } from '../api/history';
import { markChannelDead } from '../api/iptv';
import { BINGE_COUNTDOWN_SECONDS } from '../utils/binge';
import './TVPlayer.css';

// v3.12.20: how long to wait for an embed iframe to signal a load before
// auto-failing over. Dead hosts never fire onLoad; Cloudflare hang pages
// usually do not either. Reduced from 12000 to speed up fallback further.
const EMBED_LOAD_TIMEOUT_MS = 8000;

export function TVPlayer({
  item,
  server,
  // v3.9.1: accept pre-ranked allServers from App.jsx so the health-sorted,
  // addon-enriched list isn't discarded by an in-component recompute.
  allServers: externalAllServers,
  channels = [],
  episodes = [],
  currentEpisodeIndex = 0,
  onSelectEpisode,
  onSelectChannel,
  onClose
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const iframeRef = useRef(null);
  const embedWatchdogRef = useRef(null);
  const showDrawerRef = useRef(null);
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

  // Compute all playable servers.
  // v3.9.1: prefer the pre-ranked list from App.jsx (health-checked + stremio
  // addon streams included). Fall back to local computation only when absent.
  const allServers = useMemo(() => {
    if (Array.isArray(externalAllServers) && externalAllServers.length > 0) {
      return externalAllServers;
    }
    if (isLive) {
      const p = item?.players || item?.player;
      if (Array.isArray(p) && p.length > 0) return p;
      if (server && server.url) return [server];
      if (item?.url) return [{ id: 'live-1', name: 'Direct Live Stream', url: item.url, source: 'm3u8' }];
      return [];
    }
    return generateUniversalServers(item);
  }, [externalAllServers, isLive, item, server]);

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

  // Match requested server prop to currentServerIndex
  useEffect(() => {
    if (server && orderedServers.length > 0) {
      const idx = orderedServers.findIndex(s => 
        (server.id && s.id === server.id) || 
        (server.url && s.url === server.url) || 
        (server.name && s.name === server.name)
      );
      if (idx >= 0) {
        setCurrentServerIndex(idx);
        return;
      }
    }
    setCurrentServerIndex(0);
  }, [item?.id, item?.title, item?.url, server, orderedServers]);
  const [videoEngine, setVideoEngine] = useState('hls'); // 'hls' | 'native'
  const [fitMode, setFitMode] = useState('clean'); // 'clean' (default VBI crop) | 'zoom' | 'stretch' | 'original'
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bingeCountdown, setBingeCountdown] = useState(null);
  const [showOsd, setShowOsd] = useState(true);
  const [showDrawer, setShowDrawer] = useState(null); // 'channels' | 'servers' | 'audio' | 'epg' | null
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [nativeActive, setNativeActive] = useState(false);
  // v3.10.1: embed mirrors are preflighted by the native bridge before the
  // iframe mounts, so a provider's server-error page (Vercel 500 etc.) is
  // skipped before the user ever sees it.
  const [embedReady, setEmbedReady] = useState(true);
  const preflightDoneRef = useRef(false);

  const activeServer = orderedServers[currentServerIndex] || orderedServers[0] || server;
  const streamUrl = activeServer?.url || item?.url;
  const isEmbedStream = Boolean(streamUrl && (isEmbedUrl(streamUrl) || !isDirectMediaUrl(streamUrl)));

  const cycleFitMode = useCallback(() => {
    setFitMode(prev => {
      const next = prev === 'clean' ? 'zoom' : prev === 'zoom' ? 'stretch' : prev === 'stretch' ? 'original' : 'clean';
      setErrorMessage(`Aspect Fit: ${next === 'clean' ? 'Clean (No Lines)' : next === 'zoom' ? '16:9 Zoom' : next === 'stretch' ? 'Stretch Full' : 'Original 1:1'}`);
      setTimeout(() => setErrorMessage(null), 2500);
      return next;
    });
  }, []);

  const videoStyle = useMemo(() => {
    if (fitMode === 'zoom') {
      return {
        position: 'absolute',
        top: 0,
        left: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backgroundColor: 'transparent',
        background: 'transparent'
      };
    }
    if (fitMode === 'stretch') {
      return {
        position: 'absolute',
        top: 0,
        left: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        backgroundColor: 'transparent',
        background: 'transparent'
      };
    }
    if (fitMode === 'original') {
      return {
        position: 'absolute',
        top: 0,
        left: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: 'transparent',
        background: 'transparent'
      };
    }
    return {
      position: 'absolute',
      top: '-1%',
      left: '-1%',
      display: 'block',
      width: '102%',
      height: '102%',
      objectFit: 'contain',
      clipPath: 'inset(3px 0 0 0)',
      backgroundColor: 'transparent',
      background: 'transparent'
    };
  }, [fitMode]);

  // Wake up OSD and reset auto-hide timer
  // v3.10.0 FIX: read drawer state through a ref so the timer closure never
  // captures a stale showDrawer value — previously the OSD could vanish
  // underneath an open drawer.
  const pingOsd = useCallback(() => {
    setShowOsd(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      if (!showDrawerRef.current) {
        setShowOsd(false);
      }
    }, 4500);
  }, []);

  useEffect(() => {
    showDrawerRef.current = showDrawer;
  }, [showDrawer]);

  // v3.10.0: let App.handleBack know the drawer is open so the global Back
  // handler closes the drawer (via TVPlayer's own handler) instead of
  // tearing down the whole player and losing the resume position.
  useEffect(() => {
    window.__ajoPlayerDrawerOpen = Boolean(showDrawer);
    return () => {
      if (window.__ajoPlayerDrawerOpen) window.__ajoPlayerDrawerOpen = false;
    };
  }, [showDrawer]);

  // Initial OSD wake-up + resume lookup
  useEffect(() => {
    pingOsd();
    try {
      const progress = getWatchProgress(item);
      if (progress && progress.currentTime > 5) {
        resumePositionRef.current = progress.currentTime;
      }
    } catch {}
    return () => {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    };
  }, [item, pingOsd]);

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
      if (item && (item.is_live || item.type === 'live' || item.year === 'LIVE')) {
        const failedUrl = orderedServers[currentServerIndex]?.url || item.url;
        if (failedUrl) markChannelDead(failedUrl);
      }
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
    if (!isNativePlayableUrl(streamUrl)) return false;

    // Release the decoder first, then launch. Order matters here.
    teardownWebPlayback();

    const fallbackUrls = orderedServers.map(s => s?.url).filter(Boolean);
    if (!playInNativePlayer(streamUrl, title, isLive, fallbackUrls)) return false;

    nativeHandoffDoneRef.current = streamUrl;
    nativeActiveRef.current = true;
    setNativeActive(true);
    setIsBuffering(false);
    setErrorMessage(message || '▶ Opening in hardware player...');
    setTimeout(() => setErrorMessage(null), 2500);
    return true;
  }, [streamUrl, title, isLive, orderedServers, teardownWebPlayback]);

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

  // v3.12.16: Embed mirrors mount immediately so video player starts right away
  useEffect(() => {
    if (!streamUrl) return;
    if (nativeActiveRef.current) return;
    setEmbedReady(true);
    setErrorMessage(null);
  }, [streamUrl]);

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
    let disposed = false; // v3.11.0: guards the lazy hls.js import resolving after cleanup
    let lastProgressTime = 0;
    // v3.8.0: bounded fatal-error retries. Unbounded startLoad()/recoverMediaError()
    // loops kept the "Connecting..." state alive for minutes on dead CDNs.
    const isEmbedStream = isEmbedUrl(streamUrl) || !isDirectMediaUrl(streamUrl);
    if (isEmbedStream) {
      setIsBuffering(false);
      setErrorMessage(null);

      // v3.12.20 FIX: embed watchdog was previously dead code after this
      // early return. Now it's registered HERE so it actually fires. When the
      // iframe's onLoad sets dataset.loaded='1', the watchdog is a no-op.
      // If the embed times out (dead host / Cloudflare block), we failover.
      if (embedWatchdogRef.current) clearTimeout(embedWatchdogRef.current);
      embedWatchdogRef.current = setTimeout(() => {
        const iframe = iframeRef.current;
        const loaded = iframe && iframe.dataset && iframe.dataset.loaded === '1';
        if (!loaded && !nativeActiveRef.current) {
          handleFailover('Embed mirror not responding');
        }
      }, EMBED_LOAD_TIMEOUT_MS);

      return () => {
        disposed = true;
        if (embedWatchdogRef.current) {
          clearTimeout(embedWatchdogRef.current);
          embedWatchdogRef.current = null;
        }
      };
    }

    if (videoEngine === 'hls' && (streamUrl.includes('.m3u8') || streamUrl.includes('/getm3u8/') || isLive || streamUrl.endsWith('.m3u8'))) {
      (async () => {
        // v3.11.0: hls.js (~350KB) is a lazy chunk now — fetched only when a
        // stream actually needs it. Boot time and RAM on Fire TV drop sharply.
        const Hls = (await import('hls.js')).default;
        const videoNow = videoRef.current;
        if (disposed || !videoNow || videoNow !== video) return;
        if (!Hls.isSupported()) {
          if (!handOffToNative('Web player unavailable, switching to hardware player...')) {
            handleFailover('Player engine error');
          }
          return;
        }
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: isLive,
          liveSyncDurationCount: isLive ? 2 : undefined,
          startFragPrefetch: true,
          startLevel: -1,
          capLevelToPlayerSize: true,
          backBufferLength: isLive ? 30 : 60,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 8 * 1024 * 1024,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.2,
          nudgeMaxRetry: 5,
          fragLoadingTimeOut: 12000,
          manifestLoadingTimeOut: 12000,
          levelLoadingTimeOut: 12000,
        });
        hlsRef.current = hls;
  
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
  
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          if (data.audioTracks && data.audioTracks.length > 0) {
            setAvailableAudioTracks(data.audioTracks.map((t, idx) => ({
              id: idx,
              label: t.name || t.lang || `Track ${idx + 1}`
            })));
          }
          video.play().then(() => {
            setIsPlaying(true);
            setIsBuffering(false);
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
          setIsBuffering(false);
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
                if (!handOffToNative('Network error, switching to hardware player...')) {
                  hls.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                if (!handOffToNative('Media decode error, switching to hardware player...')) {
                  hls.recoverMediaError();
                }
                break;
              default:
                if (!handOffToNative('Stream engine error, switching to hardware player...')) {
                  hls.destroy();
                  hlsRef.current = null;
                  handleFailover('Stream engine error');
                }
                break;
            }
          }
        });
  
        // 24/7 Anti-Stall and Anti-Buffering watchdog timer
        let bufferingDuration = 0;
        let lastProgressTime = 0;
        stallWatchdogRef.current = setInterval(() => {
          if (video) {
            if (video.paused && isBuffering) {
              bufferingDuration += 2;
              if (bufferingDuration >= 8) {
                bufferingDuration = 0;
                if (!handOffToNative('Buffering timeout, switching to hardware player...')) {
                  handleFailover('Stream buffering timed out');
                }
              }
            } else if (!video.paused && video.readyState >= 2) {
              bufferingDuration = 0;
              if (video.currentTime === lastProgressTime && isLive) {
                hls?.recoverMediaError();
                video.play().catch(() => {});
              }
              lastProgressTime = video.currentTime;
            }
          }
        }, 2000);
      })();

    // v3.12.20: embed watchdog moved to the early-return block above (line ~460)
    } else {
      // Native Android HTML5 video playback
      video.src = streamUrl;
      const onLoadedMeta = () => {
        if (resumePositionRef.current) {
          try { video.currentTime = resumePositionRef.current; } catch {}
          resumePositionRef.current = null;
        }
      };
      video.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
      video.play().then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
        if (resumePositionRef.current) {
          try { video.currentTime = resumePositionRef.current; } catch {}
          resumePositionRef.current = null;
        }
      }).catch(err => console.warn(err));
    }

    // Periodic progress save (every 5s) so Continue Watching is accurate
    // even if the app crashes or power dies mid-watch.
    progressSaverRef.current = setInterval(() => {
      try {
        if (video.currentTime > 5 && video.duration > 0 && !isLive) {
          saveProgress(item, video.currentTime, video.duration);
        }
      } catch {}
    }, 5000);

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
      disposed = true;
      if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
      if (blackScreenWatchdogRef.current) clearInterval(blackScreenWatchdogRef.current);
      if (embedWatchdogRef.current) clearTimeout(embedWatchdogRef.current);
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

  // Auto-clear transient error messages after 3.5s
  useEffect(() => {
    if (errorMessage && !errorMessage.includes('Failed') && !errorMessage.includes('Error')) {
      const t = setTimeout(() => setErrorMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

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

      // Enter/OK key handling
      if ((key === 'Enter' || keyCode === 13 || keyCode === 23)) {
        if (!showDrawer) {
          if (isLive) {
            setShowDrawer('epg');
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (!document.activeElement || document.activeElement === document.body) {
            togglePlayPause();
          }
        }
      }

      // v3.10.0 FIX: if spatial navigation already consumed this key
      // (e.preventDefault was called to move focus), don't ALSO seek or
      // open drawers — previously ArrowLeft/Right both moved focus and
      // seeked ±10s, and ArrowDown opened the channel drawer mid-navigation.
      const navHandled = e.defaultPrevented;

      // Left / Right keys for seeking
      if (!showDrawer && !isLive && !navHandled) {
        if (key === 'ArrowLeft' || keyCode === 21 || keyCode === 37) {
          handleSeek(-10);
        } else if (key === 'ArrowRight' || keyCode === 22 || keyCode === 39) {
          handleSeek(10);
        }
      }

      // Up / Down key quick drawers. Only hijack when the OSD is visible,
      // otherwise let the spatial-nav system scroll the live rail.
      if (showOsd && !navHandled && (key === 'ArrowDown' || keyCode === 20 || keyCode === 40)) {
        if (!showDrawer && isLive && channels.length > 0) {
          setShowDrawer('channels');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pingOsd, showDrawer, onClose, isLive, channels, togglePlayPause, handleSeek, teardownWebPlayback]);

  // Format MM:SS helper
  const formatTime = (timeInSec) => {
    if (isNaN(timeInSec) || timeInSec === Infinity || timeInSec < 0) return '00:00';
    const mins = Math.floor(timeInSec / 60);
    const secs = Math.floor(timeInSec % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div 
      className="tv-player-container"
      onMouseMove={pingOsd}
      onClick={pingOsd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: '#000',
        overflow: 'hidden'
      }}
    >
      {/* 1. Direct Video Element (Clean Video-Only Layer) */}
      <video
        ref={videoRef}
        className="tv-player-video"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        style={videoStyle}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* Buffering Spinner */}
      {isBuffering && !isEmbedStream && (
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

      {/* Fallback to Embed Video Player */}
      {isEmbedStream && (
        <iframe
          ref={iframeRef}
          src={streamUrl}
          title={title}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            zIndex: 10,
            background: '#000',
            pointerEvents: 'auto'
          }}
          onLoad={() => {
            if (iframeRef.current) iframeRef.current.dataset.loaded = '1';
            if (embedWatchdogRef.current) {
              clearTimeout(embedWatchdogRef.current);
              embedWatchdogRef.current = null;
            }
          }}
          onError={() => {
            handleFailover('Embed mirror connection error');
          }}
        />
      )}

      {/* Binge-Watching Next Episode Countdown Floating Card */}
      {bingeCountdown && (
        <div style={{
          position: 'absolute',
          bottom: 120,
          right: 48,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(56, 189, 248, 0.5)',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          zIndex: 100,
          boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
        }}>
          <div>
            <div style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Next Episode in {bingeCountdown.countdown}s
            </div>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>
              {bingeCountdown.nextItem?.title || 'Next Episode'}
            </div>
          </div>
          <button
            onClick={() => {
              if (onNextEpisode && bingeCountdown.nextItem) {
                onNextEpisode(bingeCountdown.nextItem);
              }
            }}
            style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#030712',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Play size={14} fill="#030712" />
            Play Now
          </button>
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

                {isLive && (
                  <button 
                    className="tv-player-btn" 
                    tabIndex={0}
                    onClick={() => setShowDrawer(showDrawer === 'epg' ? null : 'epg')}
                    style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  >
                    <Radio size={18} />
                    <span>EPG Guide (OK)</span>
                  </button>
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

                <button 
                  className="tv-player-btn" 
                  tabIndex={0}
                  onClick={cycleFitMode}
                  title="Screen Aspect Ratio & Line Cropping"
                >
                  <Maximize size={18} />
                  <span>Fit: {fitMode === 'clean' ? 'Clean' : fitMode === 'zoom' ? 'Zoom 16:9' : fitMode === 'stretch' ? 'Stretch' : 'Original'}</span>
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
              {showDrawer === 'epg' && '📅 Live Channel EPG Guide'}
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

          {/* EPG Now / Next Guide for current channel & all channels */}
          {showDrawer === 'epg' && (() => {
            const currentEpg = getCurrentAndNextProgram(item);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Active Channel Now/Next Banner */}
                <div style={{ padding: 14, background: 'rgba(30, 41, 59, 0.8)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                    🔴 NOW AIRING ON {item?.title || 'THIS CHANNEL'}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                    {currentEpg?.current?.title || 'Live Broadcast'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 8 }}>
                    {currentEpg?.current?.startTimeFormatted} - {currentEpg?.current?.endTimeFormatted} ({currentEpg?.current?.durationMin} min)
                  </div>
                  {currentEpg?.current?.description && (
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.4, marginBottom: 8 }}>
                      {currentEpg?.current?.description}
                    </div>
                  )}
                  {currentEpg?.current?.progressPercent != null && (
                    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${currentEpg.current.progressPercent}%`, height: '100%', background: '#ef4444' }} />
                    </div>
                  )}

                  {currentEpg?.next && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>
                        NEXT SHOW ({currentEpg.next.startTimeFormatted})
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>
                        {currentEpg.next.title}
                      </div>
                    </div>
                  )}
                </div>

                {/* All Channels Quick Switch with EPG */}
                {channels.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
                      All Live Channels & Current Shows
                    </div>
                    {channels.map((ch, idx) => {
                      const chEpg = getCurrentAndNextProgram(ch);
                      return (
                        <button
                          key={ch.id || idx}
                          tabIndex={0}
                          className={`tv-drawer-item ${ch.id === item?.id ? 'active' : ''}`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 10, marginBottom: 6 }}
                          onClick={() => {
                            if (onSelectChannel) onSelectChannel(ch);
                            setShowDrawer(null);
                          }}
                        >
                          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#fff' }}>{ch.title || ch.name}</span>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{ch.category || 'Live'}</span>
                          </div>
                          {chEpg?.current && (
                            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: 4 }}>
                              NOW: <span style={{ color: '#ef4444' }}>{chEpg.current.title}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
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
            const badgeText = srv.quality || (srv.source === 'embed' ? '1080p HD' : (srv.source?.toUpperCase() || 'HLS'));
            return (
              <button
                key={srv.id || idx}
                tabIndex={0}
                className={`tv-drawer-item ${idx === currentServerIndex ? 'active' : ''}`}
                onClick={() => {
                  // v3.9.1 FIX: reset native-player state so the new server
                  // actually triggers playback instead of returning early
                  // because nativeActiveRef/nativeHandoffDoneRef is still set
                  // from the previous server's handoff.
                  nativeHandoffDoneRef.current = null;
                  nativeActiveRef.current = false;
                  setNativeActive(false);
                  setCurrentServerIndex(idx);
                  setShowDrawer(null);
                  pingOsd();
                }}
              >
                <span>{srv.name || `Server ${idx + 1}`}</span>
                <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                  {badgeText}
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
