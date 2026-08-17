import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Maximize, 
  ArrowLeft,
  Radio,
  AlertCircle,
  Tv,
  List,
  Settings2,
  PictureInPicture2,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  Subtitles,
  Sparkles,
  Moon,
  FastForward,
  Scan,
  X
} from 'lucide-react';
import { saveProgress } from '../api/history';
import { generateUniversalServers, resolveTmdbId } from '../utils/streamingEngines';
import { fetchSubtitlesForMedia } from '../api/subtitles';

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
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const hlsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const compressorRef = useRef(null);

  const [resolvedTmdbId, setResolvedTmdbId] = useState(item?.tmdb_id || null);

  const isLive = item?.is_live || 
                 item?.type === 'live' || 
                 item?.year === 'LIVE' || 
                 item?.category === 'Sports' || 
                 item?.category === 'News' || 
                 item?.category === 'Live TV' || 
                 item?.category === 'Live Channels' || 
                 item?.category === 'Live Television';

  const title = item?.title_en || item?.title || item?.name || (isLive ? "Live Broadcast" : "Cinema Stream");
  const poster = item?.backdrop_url || item?.poster_url || item?.poster || item?.logo || '';

  const [currentServerIndex, setCurrentServerIndex] = useState(0);

  // Compute all servers: direct HLS for Live TV, Universal Multi-CDN for Movies & Series
  const allServers = useMemo(() => {
    if (isLive) {
      const p = item?.players || item?.player;
      if (Array.isArray(p) && p.length > 0) return p;
      if (server && server.url) return [server];
      if (item?.url) return [{ id: 'direct-live', name: item?.title || 'Direct Live Stream', url: item.url, source: 'm3u8', quality: '1080p HD' }];
      return [];
    }
    const itemWithTmdb = resolvedTmdbId ? { ...item, tmdb_id: resolvedTmdbId } : item;
    return generateUniversalServers(itemWithTmdb);
  }, [item, server, isLive, resolvedTmdbId]);

  const activeServer = allServers[currentServerIndex] || (isLive ? { url: item?.url, source: 'm3u8' } : allServers[0]) || server;
  const streamUrl = activeServer?.url || item?.url;

  // Automatically resolve TMDB ID if missing so all 4K multi-CDN servers load perfectly
  useEffect(() => {
    if (!isLive && !item?.tmdb_id && (item?.title || item?.title_en || item?.name)) {
      resolveTmdbId(item).then(id => {
        if (id) {
          setResolvedTmdbId(id);
        }
      });
    }
  }, [item, isLive]);

  // Auto-rotate phone to Landscape upon opening content, restore Portrait upon exit
  useEffect(() => {
    if (window.AndroidOrientation && window.AndroidOrientation.setLandscape) {
      try { window.AndroidOrientation.setLandscape(); } catch (e) {}
    } else if (window.screen?.orientation?.lock) {
      try { window.screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
    }

    return () => {
      if (window.AndroidOrientation && window.AndroidOrientation.setPortrait) {
        try { window.AndroidOrientation.setPortrait(); } catch (e) {}
      } else if (window.screen?.orientation?.unlock) {
        try { window.screen.orientation.unlock(); } catch (e) {}
      }
    };
  }, []);


  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showOsd, setShowOsd] = useState(true);
  const [showChannelDrawer, setShowChannelDrawer] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsTab, setSettingsTab] = useState('quality');
  
  const [errorMsg, setErrorMsg] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('contain');
  const [zoomScale, setZoomScale] = useState(1.0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [seekFeedback, setSeekFeedback] = useState(null);

  // New Features: Night Audio, Subtitles, Auto-Play Next, Channel OSD
  const [nightModeAudio, setNightModeAudio] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [activeSubtitle, setActiveSubtitle] = useState('off');
  const [nextEpisodePrompt, setNextEpisodePrompt] = useState(null);
  const [channelBanner, setChannelBanner] = useState(null);
  const [drawerCategory, setDrawerCategory] = useState('All');

  const channelNumBufferRef = useRef('');
  const channelNumTimerRef = useRef(null);

  // HLS Engine dynamic states
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(0);

  const osdTimerRef = useRef(null);
  const touchStartXRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0 });
  const initialPinchDistRef = useRef(null);
  const initialScaleRef = useRef(1.0);
  const seekFeedbackTimerRef = useRef(null);
  const lastSavedTimeRef = useRef(0);

  const cycleAspectRatio = useCallback(() => {
    const modes = ['contain', 'cover', 'fill', '4/3'];
    const labels = {
      contain: 'Fit (16:9 Standard)',
      cover: 'Zoom / Fill (No Black Bars)',
      fill: 'Stretch Full (100%)',
      '4/3': 'Classic 4:3'
    };
    const nextIdx = (modes.indexOf(aspectRatio) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    setAspectRatio(nextMode);
    setZoomScale(1.0);
    setSeekFeedback({ type: 'mode', text: `Screen: ${labels[nextMode]}` });
    if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 2500);
  }, [aspectRatio]);

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistRef.current = dist;
      initialScaleRef.current = zoomScale;
    } else if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && initialPinchDistRef.current) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = currentDist / initialPinchDistRef.current;
      const newScale = Math.min(3.0, Math.max(1.0, initialScaleRef.current * scaleFactor));
      setZoomScale(parseFloat(newScale.toFixed(2)));
      setSeekFeedback({ type: 'zoom', text: `Zoom: ${Math.round(newScale * 100)}%` });
      if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
      seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 1500);
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      initialPinchDistRef.current = null;
    }
  };

  const handleDoubleTap = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current.time < 300) {
      const newRatio = aspectRatio === 'cover' ? 'contain' : 'cover';
      setAspectRatio(newRatio);
      setZoomScale(1.0);
      setSeekFeedback({ 
        type: 'mode', 
        text: newRatio === 'cover' ? '⚡ Zoom / Fill Screen' : '📺 Original 16:9 Fit' 
      });
      if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
      seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 2000);
    }
    lastTapRef.current = { time: now, x: e.clientX || 0 };
  };

  const bufferFailoverTimerRef = useRef(null);

  // Automatic Server Failover Engine (Auto-switches mirror on slow/broken stream)
  useEffect(() => {
    if (isBuffering && allServers.length > 1) {
      if (bufferFailoverTimerRef.current) clearTimeout(bufferFailoverTimerRef.current);
      bufferFailoverTimerRef.current = setTimeout(() => {
        const nextIdx = (currentServerIndex + 1) % allServers.length;
        setCurrentServerIndex(nextIdx);
        setErrorMsg(`⚡ Auto-switched to Server ${nextIdx + 1} (${allServers[nextIdx]?.name || `Server ${nextIdx + 1}`})`);
        setTimeout(() => setErrorMsg(null), 3500);
      }, 5500);
    } else {
      if (bufferFailoverTimerRef.current) clearTimeout(bufferFailoverTimerRef.current);
    }
    return () => {
      if (bufferFailoverTimerRef.current) clearTimeout(bufferFailoverTimerRef.current);
    };
  }, [isBuffering, currentServerIndex, allServers]);

  // Load Subtitles
  useEffect(() => {
    fetchSubtitlesForMedia(item).then(subs => {
      setSubtitleTracks(subs);
    });
  }, [item]);

  // Current Live Channel Index in Channel List
  const currentChannelIdx = useMemo(() => {
    if (!isLive || channels.length === 0) return 0;
    const idx = channels.findIndex(c => (c.id && c.id === item?.id) || c.title === item?.title);
    return idx !== -1 ? idx : 0;
  }, [channels, item, isLive]);

  const switchChannelTo = useCallback((newIdx) => {
    if (!channels || channels.length === 0) return;
    const safeIdx = (newIdx + channels.length) % channels.length;
    const targetChannel = channels[safeIdx];
    if (targetChannel && onSelectChannel) {
      setChannelBanner({
        channelNumber: 101 + safeIdx,
        title: targetChannel.title || targetChannel.name,
        category: targetChannel.category || 'Live Television'
      });
      setTimeout(() => setChannelBanner(null), 3500);
      onSelectChannel(targetChannel);
    }
  }, [channels, onSelectChannel]);

  // Auto-hide OSD
  const bumpOsd = useCallback(() => {
    setShowOsd(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    if (!showChannelDrawer && !showSettingsMenu) {
      osdTimerRef.current = setTimeout(() => {
        setShowOsd(false);
      }, 2500);
    }
  }, [showChannelDrawer, showSettingsMenu]);

  useEffect(() => {
    if (!showChannelDrawer && !showSettingsMenu && isPlaying) {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      osdTimerRef.current = setTimeout(() => {
        setShowOsd(false);
      }, 2500);
    }
    return () => {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    };
  }, [showChannelDrawer, showSettingsMenu, isPlaying]);

  const allServersRef = useRef(allServers);
  allServersRef.current = allServers;

  const currentServerIndexRef = useRef(currentServerIndex);
  currentServerIndexRef.current = currentServerIndex;

  const itemRef = useRef(item);
  itemRef.current = item;

  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;

  // Periodic Progress Saving & Auto-Play Next Episode Detection
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isLive) return;
    
    const cur = video.currentTime;
    const dur = video.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

    // Save progress every 5s
    if (dur > 0 && Math.abs(cur - lastSavedTimeRef.current) >= 5) {
      lastSavedTimeRef.current = cur;
      saveProgress(item, cur, dur);
    }

    // Next Episode Auto-play Prompt (< 25s remaining in TV Series)
    const hasNextEpisode = episodes.length > 0 && currentEpisodeIndex < episodes.length - 1;
    if (dur > 60 && (dur - cur) <= 25 && hasNextEpisode && !nextEpisodePrompt) {
      const nextEp = episodes[currentEpisodeIndex + 1];
      setNextEpisodePrompt({
        seconds: Math.round(dur - cur),
        episode: nextEp
      });
    }
  }, [isLive, item, episodes, currentEpisodeIndex, nextEpisodePrompt]);

  const handlePlayNextEpisode = useCallback(() => {
    if (episodes.length > 0 && currentEpisodeIndex < episodes.length - 1) {
      const nextEp = episodes[currentEpisodeIndex + 1];
      setNextEpisodePrompt(null);
      if (onSelectEpisode) {
        onSelectEpisode(nextEp, currentEpisodeIndex + 1);
      }
    }
  }, [episodes, currentEpisodeIndex, onSelectEpisode]);

  // Night Mode Audio Compressor Setup
  const toggleNightModeAudio = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioContext();
        const source = audioCtxRef.current.createMediaElementSource(video);
        const compressor = audioCtxRef.current.createDynamicsCompressor();
        
        compressor.threshold.setValueAtTime(-24, audioCtxRef.current.currentTime);
        compressor.knee.setValueAtTime(30, audioCtxRef.current.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtxRef.current.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtxRef.current.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtxRef.current.currentTime);

        source.connect(compressor);
        compressor.connect(audioCtxRef.current.destination);
        compressorRef.current = compressor;
      }
      setNightModeAudio(prev => !prev);
    } catch (e) {
      console.warn("Audio Context init notice:", e);
      setNightModeAudio(prev => !prev);
    }
  };

  const triggerAutoFailover = useCallback((reason = "Stream slow or unavailable") => {
    const servers = allServersRef.current;
    const currentIdx = currentServerIndexRef.current;
    if (servers && servers.length > 1 && currentIdx < servers.length - 1) {
      const nextIdx = currentIdx + 1;
      const nextName = servers[nextIdx]?.name || `Server ${nextIdx + 1}`;
      setErrorMsg(`⚡ ${reason}. Switching to ${nextName}...`);
      setCurrentServerIndex(nextIdx);
      setTimeout(() => setErrorMsg(null), 3500);
    } else {
      setErrorMsg("Playback error. Please select another server in Settings.");
      setIsBuffering(false);
    }
  }, []);

  // Video and HLS initialization (with continuous 24/7 anti-stall and RAM flush)
  useEffect(() => {
    if (!streamUrl) {
      setIsBuffering(false);
      return;
    }

    setErrorMsg(null);
    setIsBuffering(true);
    const video = videoRef.current;
    if (!video) return;

    let hls = null;
    let initialPlayAttempted = false;
    let retryCount = 0;
    let watchdogTimer = null;
    let lastProgressTime = 0;

    const isLiveStream = isLiveRef.current;

    if (Hls.isSupported() && (streamUrl.includes('.m3u8') || streamUrl.includes('/getm3u8/') || isLiveStream || streamUrl.startsWith('http'))) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: isLiveStream,
        startLevel: -1, // Netflix-Style Smart Auto Adaptive Quality
        capLevelToPlayerSize: true, // Cap rendering to device specs & resolution
        abrEwmaDefaultEstimate: 5000000, // Instant Crisp HD Startup (5 Mbps initial estimate)
        abrBandWidthFactor: 0.95, // Maximize resolution based on connection speed
        abrBandWidthUpFactor: 0.7, // Fast upward quality switching
        abrMaxWithRealBitrate: true,
        backBufferLength: isLiveStream ? 0 : 30, // 0 for Live immediately purges old segments from RAM
        maxBufferLength: isLiveStream ? 10 : 60,
        maxMaxBufferLength: isLiveStream ? 20 : 120,
        maxBufferSize: isLiveStream ? 15 * 1024 * 1024 : 60 * 1024 * 1024,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        liveDurationInfinity: isLiveStream,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 8,
        startFragPrefetch: true,
        progressive: true,
        testBandwidth: false,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 12000,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 4,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        setIsBuffering(false);
        if (data.levels && data.levels.length > 0) {
          setQualities(data.levels.map((l, idx) => ({
            id: idx,
            label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`,
            height: l.height
          })));
        }
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          setAudioTracks(hls.audioTracks.map((t, idx) => ({
            id: idx,
            label: t.name || t.lang || `Track ${idx + 1}`
          })));
        }
        if (itemRef.current?.currentTime && !isLiveStream && !initialPlayAttempted) {
          try {
            video.currentTime = itemRef.current.currentTime;
          } catch (_) {}
        }
        initialPlayAttempted = true;
        video.play().then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        }).catch(e => console.warn("Autoplay notice:", e));
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
        setCurrentAudio(data.id);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
          if (isLiveStream && hls.liveSyncPosition) {
            try { video.currentTime = hls.liveSyncPosition; } catch (_) {}
          }
          hls.recoverMediaError();
          if (video && video.paused) {
            video.play().catch(() => {});
          }
          return;
        }
        if (data.fatal) {
          retryCount++;
          if (retryCount > 4) {
            hls.destroy();
            triggerAutoFailover("Stream unreachable");
            return;
          }
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              if (video && video.paused) video.play().catch(() => {});
              break;
            default:
              hls.destroy();
              triggerAutoFailover("Stream decoding error");
              break;
          }
        }
      });

      // 24/7 Anti-Freeze Watchdog Timer for continuous live streams
      if (isLiveStream) {
        watchdogTimer = setInterval(() => {
          if (video && !video.paused && !document.hidden && video.readyState >= 2) {
            if (video.currentTime === lastProgressTime) {
              // Video playback is frozen or stalled on segment boundary
              if (hls && hls.liveSyncPosition) {
                try { video.currentTime = hls.liveSyncPosition; } catch (_) {}
              }
              hls?.recoverMediaError();
              video.play().catch(() => {});
            }
            lastProgressTime = video.currentTime;
          }
        }, 4000);
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
      }).catch(e => console.warn(e));
    } else {
      video.src = streamUrl;
      video.play().then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
      }).catch(e => console.warn(e));
    }

    return () => {
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, triggerAutoFailover]);

  // Auto-focus active elements when drawers or OSD open
  useEffect(() => {
    if (showChannelDrawer) {
      const timer = setTimeout(() => {
        const activeCard = document.querySelector('.player-channel-card.server-active, .player-channel-card, .player-channel-drawer [data-focusable="true"]');
        if (activeCard) {
          activeCard.focus();
          activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showChannelDrawer]);

  useEffect(() => {
    if (showSettingsMenu) {
      const timer = setTimeout(() => {
        const activeTab = document.querySelector('.player-settings-drawer .tab-pill-active, .player-settings-drawer [data-focusable="true"]');
        if (activeTab) {
          activeTab.focus();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showSettingsMenu]);

  useEffect(() => {
    if (showOsd) {
      const timer = setTimeout(() => {
        const playBtn = document.querySelector('.player-osd .player-center-play-btn, .player-osd .player-btn');
        if (playBtn) {
          playBtn.focus();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showOsd]);

  // Remote Keys (D-Pad, Number Pad, Channel+/Channel-, Media Keys)
  const backPressedWhileHiddenRef = useRef(false);

  useEffect(() => {
    const handleRemoteKeys = (e) => {
      const video = videoRef.current;
      const key = e.key;

      // 1. Number Pad Direct Channel Tuning (0-9)
      if (/^[0-9]$/.test(key) && isLive && channels.length > 0) {
        channelNumBufferRef.current += key;
        const buf = channelNumBufferRef.current;
        setChannelBanner({
          channelNumber: buf,
          title: `Tuning to Channel ${buf}...`,
          category: 'Direct Tuning'
        });

        if (channelNumTimerRef.current) clearTimeout(channelNumTimerRef.current);
        channelNumTimerRef.current = setTimeout(() => {
          const num = parseInt(channelNumBufferRef.current, 10);
          channelNumBufferRef.current = '';
          const targetIdx = num >= 101 ? num - 101 : num - 1;
          switchChannelTo(targetIdx);
        }, 1200);
        return;
      }

      // 2. Back / Escape / GoBack
      if (key === 'Escape' || key === 'Backspace' || key === 'GoBack') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (nextEpisodePrompt) {
          setNextEpisodePrompt(null);
          return;
        }
        if (showSettingsMenu) {
          setShowSettingsMenu(false);
          return;
        }
        if (showChannelDrawer) {
          setShowChannelDrawer(false);
          return;
        }
        if (showOsd) {
          setShowOsd(false);
          if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
          backPressedWhileHiddenRef.current = false;
          return;
        }
        if (!backPressedWhileHiddenRef.current) {
          backPressedWhileHiddenRef.current = true;
          bumpOsd();
          return;
        }
        backPressedWhileHiddenRef.current = false;
        if (video && !isLive && duration > 0) {
          saveProgress(item, video.currentTime, duration);
        }
        onClose();
        return;
      }

      // 3. Quick Channel Switcher Drawer D-Pad Navigation
      if (showChannelDrawer) {
        const drawer = document.querySelector('.player-channel-drawer');
        if (drawer) {
          const tabs = Array.from(drawer.querySelectorAll('.tab-pill'));
          const cards = Array.from(drawer.querySelectorAll('.player-channel-card'));
          const active = document.activeElement;

          if (key === 'ArrowRight' || key === 'Right') {
            e.preventDefault();
            e.stopPropagation();
            if (tabs.includes(active)) {
              const curr = tabs.indexOf(active);
              const next = (curr + 1) % tabs.length;
              tabs[next]?.focus();
            } else if (cards.includes(active)) {
              const curr = cards.indexOf(active);
              const next = (curr + 1) % cards.length;
              cards[next]?.focus();
              cards[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else if (cards.length > 0) {
              cards[0]?.focus();
            }
            return;
          }

          if (key === 'ArrowLeft' || key === 'Left') {
            e.preventDefault();
            e.stopPropagation();
            if (tabs.includes(active)) {
              const curr = tabs.indexOf(active);
              const prev = (curr - 1 + tabs.length) % tabs.length;
              tabs[prev]?.focus();
            } else if (cards.includes(active)) {
              const curr = cards.indexOf(active);
              const prev = (curr - 1 + cards.length) % cards.length;
              cards[prev]?.focus();
              cards[prev]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else if (cards.length > 0) {
              cards[0]?.focus();
            }
            return;
          }

          if (key === 'ArrowDown' || key === 'Down') {
            e.preventDefault();
            e.stopPropagation();
            if (tabs.includes(active) && cards.length > 0) {
              const activeCard = cards.find(c => c.classList.contains('server-active')) || cards[0];
              activeCard?.focus();
              activeCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
            return;
          }

          if (key === 'ArrowUp' || key === 'Up') {
            e.preventDefault();
            e.stopPropagation();
            if (cards.includes(active) && tabs.length > 0) {
              const activeTab = tabs.find(t => t.classList.contains('tab-pill-active')) || tabs[0];
              activeTab?.focus();
            }
            return;
          }

          if (key === 'Enter' || key === ' ' || key === 'Select') {
            e.preventDefault();
            e.stopPropagation();
            if (active && typeof active.click === 'function') {
              active.click();
            }
            return;
          }
        }
      }

      // 4. Settings Menu Drawer D-Pad Navigation
      if (showSettingsMenu) {
        const drawer = document.querySelector('.player-settings-drawer');
        if (drawer) {
          const tabs = Array.from(drawer.querySelectorAll('.settings-drawer-header .tab-pill'));
          const options = Array.from(drawer.querySelectorAll('.settings-drawer-content .settings-opt-btn'));
          const active = document.activeElement;

          if (key === 'ArrowRight' || key === 'Right') {
            if (tabs.includes(active)) {
              e.preventDefault();
              e.stopPropagation();
              const curr = tabs.indexOf(active);
              const next = (curr + 1) % tabs.length;
              tabs[next]?.focus();
              return;
            }
          }

          if (key === 'ArrowLeft' || key === 'Left') {
            if (tabs.includes(active)) {
              e.preventDefault();
              e.stopPropagation();
              const curr = tabs.indexOf(active);
              const prev = (curr - 1 + tabs.length) % tabs.length;
              tabs[prev]?.focus();
              return;
            }
          }

          if (key === 'ArrowDown' || key === 'Down') {
            e.preventDefault();
            e.stopPropagation();
            if (tabs.includes(active) && options.length > 0) {
              options[0]?.focus();
            } else if (options.includes(active)) {
              const curr = options.indexOf(active);
              const next = (curr + 1) % options.length;
              options[next]?.focus();
            }
            return;
          }

          if (key === 'ArrowUp' || key === 'Up') {
            e.preventDefault();
            e.stopPropagation();
            if (options.includes(active)) {
              const curr = options.indexOf(active);
              if (curr === 0) {
                const activeTab = tabs.find(t => t.classList.contains('tab-pill-active')) || tabs[0];
                activeTab?.focus();
              } else {
                options[curr - 1]?.focus();
              }
            }
            return;
          }

          if (key === 'Enter' || key === ' ' || key === 'Select') {
            e.preventDefault();
            e.stopPropagation();
            if (active && typeof active.click === 'function') {
              active.click();
            }
            return;
          }
        }
      }

      // 5. OSD Navigation
      if (showOsd) {
        const osdEl = document.querySelector('.player-osd');
        const active = document.activeElement;

        if (key === 'Enter' || key === ' ' || key === 'Select') {
          if (osdEl && active && osdEl.contains(active) && typeof active.click === 'function') {
            e.preventDefault();
            e.stopPropagation();
            active.click();
            return;
          }
        }
      }

      bumpOsd();
      backPressedWhileHiddenRef.current = false;

      // 6. Channel Up & Next Channel (D-Pad UP / ChannelUp / PageUp)
      if (key === 'ChannelUp' || key === 'PageUp' || (key === 'ArrowUp' && isLive && !showChannelDrawer && !showSettingsMenu)) {
        if (isLive && channels.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          switchChannelTo(currentChannelIdx + 1);
          return;
        }
      }

      // 7. Channel Down & Previous Channel (D-Pad DOWN / ChannelDown / PageDown)
      if (key === 'ChannelDown' || key === 'PageDown' || (key === 'ArrowDown' && isLive && !showChannelDrawer && !showSettingsMenu)) {
        if (isLive && channels.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          switchChannelTo(currentChannelIdx - 1);
          return;
        }
      }

      switch (key) {
        case ' ':
        case 'Enter':
        case 'Select':
        case 'MediaPlayPause':
          if (nextEpisodePrompt) {
            e.preventDefault();
            handlePlayNextEpisode();
            return;
          }
          if (video && !showChannelDrawer && !showSettingsMenu) {
            e.preventDefault();
            if (video.paused) {
              video.play();
              setIsPlaying(true);
            } else {
              video.pause();
              setIsPlaying(false);
            }
          }
          break;
        case 'ArrowLeft':
        case 'MediaRewind':
          if (isLive && channels.length > 0 && !showChannelDrawer) {
            e.preventDefault();
            setShowChannelDrawer(true);
          } else if (video && !isLive && !showSettingsMenu) {
            e.preventDefault();
            e.stopPropagation();
            seek(-10);
          }
          break;
        case 's':
        case 'S':
        case 'MediaTrackNext':
          if (!isLive && allServers.length > 1) {
            e.preventDefault();
            const nextIdx = (currentServerIndex + 1) % allServers.length;
            setCurrentServerIndex(nextIdx);
            setErrorMsg(`⚡ Switched to ${allServers[nextIdx]?.name || `Server ${nextIdx + 1}`}`);
            setTimeout(() => setErrorMsg(null), 3500);
          }
          break;
        case 'ArrowRight':
        case 'MediaFastForward':
          if (isLive && channels.length > 0 && !showChannelDrawer) {
            e.preventDefault();
            setShowChannelDrawer(true);
          } else if (video && !isLive && !showSettingsMenu) {
            e.preventDefault();
            e.stopPropagation();
            seek(10);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleRemoteKeys, { capture: true });
    window.addEventListener('mousemove', bumpOsd);
    
    return () => {
      window.removeEventListener('keydown', handleRemoteKeys, { capture: true });
      window.removeEventListener('mousemove', bumpOsd);
    };
  }, [bumpOsd, onClose, isLive, channels, currentChannelIdx, switchChannelTo, showChannelDrawer, showSettingsMenu, showOsd, duration, item, nextEpisodePrompt, handlePlayNextEpisode, drawerCategory]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    bumpOsd();
  };

  const seek = (seconds) => {
    const video = videoRef.current;
    if (!video || isLive) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    bumpOsd();
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return "00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleQualityChange = (levelId) => {
    setCurrentQuality(levelId);
    if (hlsRef.current) hlsRef.current.currentLevel = levelId;
  };

  const handleAudioChange = (trackId) => {
    setCurrentAudio(trackId);
    if (hlsRef.current) hlsRef.current.audioTrack = trackId;
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const handleExitPlayer = () => {
    if (videoRef.current && !isLive && duration > 0) {
      saveProgress(item, videoRef.current.currentTime, duration);
    }
    onClose();
  };

  return (
    <div 
      className="tv-player-container"
      ref={containerRef}
      onClick={bumpOsd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >

      <video
        ref={videoRef}
        className="tv-video-element"
        style={{
          objectFit: aspectRatio === 'fill' ? 'fill' : (aspectRatio === 'cover' ? 'cover' : 'contain'),
          aspectRatio: aspectRatio === '4/3' ? '4/3' : 'unset',
          transform: zoomScale !== 1.0 ? `scale(${zoomScale})` : undefined,
          transformOrigin: 'center center',
          transition: 'transform 0.1s ease-out'
        }}
        playsInline
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={(e) => {
          handleDoubleTap(e);
          togglePlay();
        }}
      />

      {/* Live TV Channel Switcher OSD Banner */}
      {channelBanner && (
        <div style={{
          position: 'absolute',
          top: '36px',
          left: '48px',
          background: 'rgba(10, 14, 23, 0.98)',
          border: '1px solid rgba(56, 189, 248, 0.6)',
          borderRadius: '18px',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          zIndex: 80,
          boxShadow: '0 16px 40px rgba(0,0,0,0.9), 0 0 24px rgba(56, 189, 248, 0.25)',
          animation: 'slideInLeft 0.3s ease-out'
        }}>
          <div style={{
            background: 'var(--accent-gradient)',
            color: '#fff',
            fontWeight: 900,
            fontSize: '18px',
            padding: '6px 14px',
            borderRadius: '12px'
          }}>
            {channelBanner.channelNumber}
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>
              {channelBanner.title}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span className="live-pulse-dot" style={{ display: 'inline-block' }} />
              <span>Full HD 1080p 60fps</span>
              <span>•</span>
              <span style={{ color: '#38bdf8' }}>{channelBanner.category}</span>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Play Next Episode Floating Prompt */}
      {nextEpisodePrompt && (
        <div className="next-episode-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FastForward size={24} color="#38bdf8" />
            <div>
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Up Next</span>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                {nextEpisodePrompt.episode?.title || `Episode ${currentEpisodeIndex + 2}`}
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="tv-btn tv-btn-primary"
              data-focusable="true"
              tabIndex={0}
              onClick={handlePlayNextEpisode}
              style={{ background: '#38bdf8', color: '#06090e', fontWeight: 900 }}
            >
              Play Now
            </button>
            <button
              className="tv-btn tv-btn-secondary"
              data-focusable="true"
              tabIndex={0}
              onClick={() => setNextEpisodePrompt(null)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Buffering Loader with 1-Click Server Switch Option */}
      {isBuffering && (
        <div className="player-loading-overlay">
          <div className="player-spinner-box">
            <Loader2 size={48} className="animate-spin" color="#38bdf8" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                Buffering High-Speed Stream...
              </span>
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>
                {title} • {activeServer?.name || `Server ${currentServerIndex + 1}`}
              </span>
            </div>

            {allServers.length > 1 && (
              <button
                className="tv-btn tv-btn-secondary"
                data-focusable="true"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  const nextIdx = (currentServerIndex + 1) % allServers.length;
                  setCurrentServerIndex(nextIdx);
                  setErrorMsg(`Switched to ${allServers[nextIdx]?.name || `Server ${nextIdx + 1}`}`);
                  setTimeout(() => setErrorMsg(null), 3000);
                }}
                style={{ marginTop: '12px', fontSize: '12px', padding: '8px 18px', borderRadius: '14px', background: 'rgba(56, 189, 248, 0.15)', borderColor: '#38bdf8' }}
              >
                <span>⚡ Stream Slow? Switch to Next Server ({allServers[(currentServerIndex + 1) % allServers.length]?.name || 'Next'})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', padding: '14px 22px', background: 'rgba(239,68,68,0.95)', borderRadius: '14px', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 120, boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
          <AlertCircle size={20} />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>{errorMsg}</span>
        </div>
      )}

      {/* Prominent High-Visibility Server Switcher with Automatic Failover */}
      {!isLive && allServers.length > 1 && (
        <div 
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            bottom: showOsd ? '95px' : '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 95,
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            background: 'rgba(10, 15, 29, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            padding: '6px 14px',
            borderRadius: '30px',
            border: '1px solid rgba(56, 189, 248, 0.6)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 16px rgba(56, 189, 248, 0.2)',
            maxWidth: '94vw',
            overflowX: 'auto',
            transition: 'bottom 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <span className="live-pulse-dot" style={{ background: '#22c55e', width: '6px', height: '6px' }} />
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.5px' }}>AUTO SERVERS:</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {allServers.map((s, idx) => {
              const isActive = currentServerIndex === idx;
              return (
                <button
                  key={s.id || idx}
                  data-focusable="true"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentServerIndex(idx);
                    setIsBuffering(true);
                    setErrorMsg(`Switched to Server ${idx + 1}`);
                    setTimeout(() => setErrorMsg(null), 2500);
                    setTimeout(() => setIsBuffering(false), 1000);
                  }}
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '5px 12px',
                    borderRadius: '16px',
                    background: isActive ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' : 'rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#06090e' : '#cbd5e1',
                    border: isActive ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: isActive ? '0 2px 10px rgba(56, 189, 248, 0.4)' : 'none'
                  }}
                >
                  {s.name || `Server ${idx + 1}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Advanced Settings Drawer */}
      {showSettingsMenu && (
        <div className="player-settings-drawer" onClick={e => e.stopPropagation()}>
          <div className="settings-drawer-header">
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button 
                className={`tab-pill ${settingsTab === 'quality' ? 'tab-pill-active' : ''}`}
                data-focusable="true"
                tabIndex={0}
                onClick={() => setSettingsTab('quality')}
              >
                Quality
              </button>
              <button 
                className={`tab-pill ${settingsTab === 'subtitles' ? 'tab-pill-active' : ''}`}
                data-focusable="true"
                tabIndex={0}
                onClick={() => setSettingsTab('subtitles')}
              >
                Subtitles
              </button>
              <button 
                className={`tab-pill ${settingsTab === 'audio' ? 'tab-pill-active' : ''}`}
                data-focusable="true"
                tabIndex={0}
                onClick={() => setSettingsTab('audio')}
              >
                Audio & Night Mode
              </button>
              <button 
                className={`tab-pill ${settingsTab === 'aspect' ? 'tab-pill-active' : ''}`}
                data-focusable="true"
                tabIndex={0}
                onClick={() => setSettingsTab('aspect')}
              >
                Aspect & Ambilight
              </button>
              <button 
                className={`tab-pill ${settingsTab === 'speed' ? 'tab-pill-active' : ''}`}
                data-focusable="true"
                tabIndex={0}
                onClick={() => setSettingsTab('speed')}
              >
                Speed
              </button>
              {allServers.length > 1 && (
                <button 
                  className={`tab-pill ${settingsTab === 'server' ? 'tab-pill-active' : ''}`}
                  data-focusable="true"
                  tabIndex={0}
                  onClick={() => setSettingsTab('server')}
                >
                  Servers ({allServers.length})
                </button>
              )}
            </div>

            <button
              className="player-btn"
              data-focusable="true"
              tabIndex={0}
              onClick={() => setShowSettingsMenu(false)}
              style={{ width: '36px', height: '36px' }}
            >
              ✕
            </button>
          </div>

          <div className="settings-drawer-content">
            {settingsTab === 'quality' && (
              <div className="settings-options-grid">
                <button
                  className={`settings-opt-btn ${currentQuality === -1 ? 'is-selected' : ''}`}
                  data-focusable="true"
                  tabIndex={0}
                  onClick={() => handleQualityChange(-1)}
                >
                  <span>Auto (Adaptive HD)</span>
                  {currentQuality === -1 && <Check size={16} color="#38bdf8" />}
                </button>
                {qualities.map((q) => (
                  <button
                    key={q.id}
                    className={`settings-opt-btn ${currentQuality === q.id ? 'is-selected' : ''}`}
                    data-focusable="true"
                    tabIndex={0}
                    onClick={() => handleQualityChange(q.id)}
                  >
                    <span>{q.label}</span>
                    {currentQuality === q.id && <Check size={16} color="#38bdf8" />}
                  </button>
                ))}
              </div>
            )}

            {/* Subtitles Tab */}
            {settingsTab === 'subtitles' && (
              <div className="settings-options-grid">
                <button
                  className={`settings-opt-btn ${activeSubtitle === 'off' ? 'is-selected' : ''}`}
                  data-focusable="true"
                  tabIndex={0}
                  onClick={() => setActiveSubtitle('off')}
                >
                  <span>Subtitles Off</span>
                  {activeSubtitle === 'off' && <Check size={16} color="#38bdf8" />}
                </button>
                {subtitleTracks.map((sub) => (
                  <button
                    key={sub.id}
                    className={`settings-opt-btn ${activeSubtitle === sub.id ? 'is-selected' : ''}`}
                    data-focusable="true"
                    tabIndex={0}
                    onClick={() => setActiveSubtitle(sub.id)}
                  >
                    <span>{sub.label}</span>
                    {activeSubtitle === sub.id && <Check size={16} color="#38bdf8" />}
                  </button>
                ))}
              </div>
            )}

            {/* Audio & Night Mode */}
            {settingsTab === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <button
                  className={`settings-opt-btn ${nightModeAudio ? 'is-selected' : ''}`}
                  data-focusable="true"
                  tabIndex={0}
                  onClick={toggleNightModeAudio}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Moon size={18} color="#a855f7" />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 800 }}>Night Mode Vocal Booster</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>Compresses loud sounds and clarifies quiet dialogue</div>
                    </div>
                  </div>
                  {nightModeAudio && <Check size={16} color="#38bdf8" />}
                </button>

                <div className="settings-options-grid" style={{ marginTop: '8px' }}>
                  {audioTracks.length > 0 ? (
                    audioTracks.map((a) => (
                      <button
                        key={a.id}
                        className={`settings-opt-btn ${currentAudio === a.id ? 'is-selected' : ''}`}
                        data-focusable="true"
                        tabIndex={0}
                        onClick={() => handleAudioChange(a.id)}
                      >
                        <span>{a.label}</span>
                        {currentAudio === a.id && <Check size={16} color="#38bdf8" />}
                      </button>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)', padding: '12px' }}>Default Multi-Channel Audio (Auto)</span>
                  )}
                </div>
              </div>
            )}

            {/* Aspect Ratio */}
            {settingsTab === 'aspect' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="settings-options-grid">
                  {[
                    { id: 'contain', label: '16:9 Fit (Standard Cinema)' },
                    { id: 'cover', label: 'Zoom & Crop (Fill Screen)' },
                    { id: 'fill', label: 'Stretch Full (No Black Bars)' },
                    { id: '4/3', label: '4:3 Classic TV' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      className={`settings-opt-btn ${aspectRatio === opt.id ? 'is-selected' : ''}`}
                      data-focusable="true"
                      tabIndex={0}
                      onClick={() => setAspectRatio(opt.id)}
                    >
                      <span>{opt.label}</span>
                      {aspectRatio === opt.id && <Check size={16} color="#38bdf8" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {settingsTab === 'speed' && (
              <div className="settings-options-grid">
                {[0.75, 1.0, 1.25, 1.5, 2.0].map(s => (
                  <button
                    key={s}
                    className={`settings-opt-btn ${playbackRate === s ? 'is-selected' : ''}`}
                    data-focusable="true"
                    tabIndex={0}
                    onClick={() => handleSpeedChange(s)}
                  >
                    <span>{s === 1.0 ? '1.0x (Normal)' : `${s}x`}</span>
                    {playbackRate === s && <Check size={16} color="#38bdf8" />}
                  </button>
                ))}
              </div>
            )}

            {settingsTab === 'server' && (
              <div className="settings-options-grid">
                {allServers.map((srv, idx) => (
                  <button
                    key={idx}
                    className={`settings-opt-btn ${currentServerIndex === idx ? 'is-selected' : ''}`}
                    data-focusable="true"
                    tabIndex={0}
                    onClick={() => {
                      setCurrentServerIndex(idx);
                      setShowSettingsMenu(false);
                    }}
                  >
                    <span>{srv.translator || `Server ${idx + 1}`} ({srv.source || 'HLS'})</span>
                    {currentServerIndex === idx && <Check size={16} color="#38bdf8" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Channel Switcher Overlay with Category Filters */}
      {showChannelDrawer && isLive && channels.length > 0 && (
        <div className="player-channel-drawer" onClick={e => e.stopPropagation()}>
          <div className="player-channel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="player-channel-badge">⚡ QUICK SWITCHER</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>Live Channels</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['All', 'Sports', 'News', 'Entertainment', 'Movies'].map(cat => (
                  <button
                    key={cat}
                    className={`tab-pill ${drawerCategory === cat ? 'tab-pill-active' : ''}`}
                    data-focusable="true"
                    tabIndex={0}
                    onClick={() => setDrawerCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                Press D-Pad ◄ ► to Surf • Enter to Watch • Back to Close
              </span>
              <button
                className="player-btn"
                data-focusable="true"
                tabIndex={0}
                onClick={() => setShowChannelDrawer(false)}
                style={{ width: '32px', height: '32px' }}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="player-channel-scroll">
            {channels
              .filter(ch => {
                if (drawerCategory === 'All') return true;
                const cat = (ch.category || '').toLowerCase();
                const title = (ch.title || '').toLowerCase();
                const target = drawerCategory.toLowerCase();
                if (target === 'sports') return cat.includes('sport') || title.includes('sport') || title.includes('cricket') || title.includes('ten') || title.includes('willow') || title.includes('fancode');
                if (target === 'news') return cat.includes('news') || title.includes('news') || title.includes('tak') || title.includes('abp') || title.includes('republic');
                if (target === 'movies') return cat.includes('movie') || title.includes('cinema') || title.includes('max') || title.includes('film');
                if (target === 'entertainment') return cat.includes('entertainment') || title.includes('star') || title.includes('sony') || title.includes('zee') || title.includes('colors');
                return true;
              })
              .map((ch, idx) => {
                const isCurrent = ch.title === item.title;
                const chNum = 100 + idx + 1;
                return (
                  <button
                    key={ch.id || idx}
                    className={`player-channel-card ${isCurrent ? 'server-active' : ''}`}
                    data-focusable="true"
                    tabIndex={0}
                    onClick={() => {
                      setShowChannelDrawer(false);
                      if (onSelectChannel) {
                        onSelectChannel(ch);
                      } else {
                        const originalIdx = channels.findIndex(c => c.title === ch.title);
                        if (originalIdx >= 0) switchChannelTo(originalIdx);
                      }
                    }}
                  >
                    <div className="channel-card-top">
                      <span className="channel-num-tag">#{chNum}</span>
                      {isCurrent && (
                        <span className="channel-live-dot-tag">
                          <span className="live-pulse-dot" /> LIVE
                        </span>
                      )}
                    </div>

                    <div className="channel-card-body">
                      {ch.poster_url || ch.poster || ch.logo ? (
                        <img 
                          src={ch.poster_url || ch.poster || ch.logo} 
                          alt={ch.title} 
                          className="channel-card-img"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="channel-card-fallback-icon">
                          <Radio size={22} color={isCurrent ? '#38bdf8' : '#94a3b8'} />
                        </div>
                      )}
                      <span className="channel-card-name" title={ch.title}>{ch.title}</span>
                    </div>

                    <div className="channel-card-footer">
                      <span>{ch.category || 'Live TV'}</span>
                      <span style={{ color: '#38bdf8' }}>1080p</span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* ON-SCREEN DISPLAY (OSD) */}
      <div 
        className={`player-osd ${showOsd ? 'is-visible' : 'is-hidden'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) togglePlay();
        }}
      >
        <div className="player-top-bar">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <button 
              className="player-btn"
              data-focusable="true"
              tabIndex={0}
              onClick={handleExitPlayer}
              style={{ marginTop: '2px' }}
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="player-media-title">{title}</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {isLive ? '1080p • Live Broadcast' : '4K Ultra HD • Cinema Stream'}
              </span>

              {/* Quick Server Switcher Pills for VOD Cinema / Series */}
              {!isLive && allServers.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {allServers.map((s, idx) => (
                    <button
                      key={s.id || idx}
                      className={`tab-pill ${currentServerIndex === idx ? 'tab-pill-active' : ''}`}
                      data-focusable="true"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentServerIndex(idx);
                        setIsBuffering(true);
                        setTimeout(() => setIsBuffering(false), 1500);
                      }}
                      style={{ fontSize: '11px', padding: '4px 12px' }}
                    >
                      {s.name || `Server ${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isLive ? (
              <span className="hero-badge" style={{ background: 'rgba(239,68,68,0.9)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}>
                <Radio size={14} className="animate-pulse" /> LIVE
              </span>
            ) : (
              <span className="hero-badge badge-quality" style={{ padding: '6px 14px' }}>
                {activeServer?.quality || '4K UHD'}
              </span>
            )}

            <button
              className="player-btn"
              data-focusable="true"
              tabIndex={0}
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="Settings"
              style={{ width: '42px', height: '42px' }}
            >
              <Settings2 size={20} />
            </button>

            <button
              className="player-btn"
              data-focusable="true"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                cycleAspectRatio();
              }}
              title="Screen Fit / Aspect Ratio (Zoom / Crop)"
              style={{ width: '42px', height: '42px' }}
            >
              <Scan size={20} />
            </button>

            <button
              className="player-btn"
              data-focusable="true"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (containerRef.current) {
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                    if (window.AndroidOrientation?.setPortrait) {
                      window.AndroidOrientation.setPortrait();
                    }
                  } else {
                    containerRef.current.requestFullscreen().catch(() => {});
                    if (window.AndroidOrientation?.setLandscape) {
                      window.AndroidOrientation.setLandscape();
                    }
                  }
                }
              }}
              title="Fullscreen"
              style={{ width: '42px', height: '42px' }}
            >
              <Maximize size={20} />
            </button>

            {isLive && channels.length > 0 && (
              <button
                className="player-btn"
                data-focusable="true"
                tabIndex={0}
                onClick={() => setShowChannelDrawer(!showChannelDrawer)}
                title="Channels"
                style={{ width: '42px', height: '42px' }}
              >
                <List size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Bottom bar for native video streams */}
        <div className="player-bottom-bar">
            {/* Progress Timeline for VOD */}
            {!isLive && (
              <div>
                <div 
                  className="player-scrubber-track"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    if (videoRef.current && duration) {
                      videoRef.current.currentTime = pos * duration;
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div 
                    className="player-scrubber-fill"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            )}

            <div className="player-controls-row">
              <div className="player-btn-group">
                {!isLive && (
                  <button 
                    className="player-btn"
                    data-focusable="true"
                    tabIndex={0}
                    onClick={() => seek(-10)}
                  >
                    <RotateCcw size={20} />
                  </button>
                )}

                <button 
                  className="player-btn"
                  data-focusable="true"
                  tabIndex={0}
                  onClick={togglePlay}
                  style={{ width: '56px', height: '56px' }}
                >
                  {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
                </button>

                {!isLive && (
                  <>
                    <button 
                      className="player-btn"
                      data-focusable="true"
                      tabIndex={0}
                      onClick={() => seek(10)}
                      title="Forward 10s"
                    >
                      <RotateCw size={20} />
                    </button>

                    <button 
                      className="player-btn"
                      data-focusable="true"
                      tabIndex={0}
                      onClick={() => seek(85)}
                      title="Skip Intro (+85s)"
                      style={{ width: 'auto', padding: '0 16px', borderRadius: '24px', fontSize: '12px', fontWeight: 800, gap: '6px' }}
                    >
                      <FastForward size={16} color="#38bdf8" />
                      <span>Skip Intro</span>
                    </button>
                  </>
                )}
              </div>

              <div className="player-btn-group">
                <button 
                  className="player-btn"
                  data-focusable="true"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleAspectRatio();
                  }}
                  title="Aspect Ratio (Fit / Zoom / Fill)"
                >
                  <Scan size={20} />
                </button>

                <button 
                  className="player-btn"
                  data-focusable="true"
                  tabIndex={0}
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.muted = !videoRef.current.muted;
                      setIsMuted(videoRef.current.muted);
                    }
                  }}
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
