import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ArrowLeft, Check, Loader2, Pause, Play, Settings2, Volume2, VolumeX } from 'lucide-react';
import { saveProgress } from '../api/history';
import { detectStreamType, generateUniversalServers } from '../utils/streamingEngines';

const STARTUP_TIMEOUT_MS = 15000;
const REBUFFER_TIMEOUT_MS = 10000;

export function TVPlayer({ item, server, channels = [], onSelectChannel, onClose }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const timeoutRef = useRef(null);
  const retriesRef = useRef(0);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isLive = Boolean(item?.is_live || item?.type === 'live' || item?.year === 'LIVE');
  const sources = useMemo(() => {
    const merged = generateUniversalServers({ ...item, players: [...(item?.players || item?.player || []), ...(server ? [server] : [])] });
    return merged;
  }, [item, server]);
  const activeSource = sources[sourceIndex];

  const clearFailureTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const failover = useCallback((message) => {
    clearFailureTimer();
    if (sourceIndex + 1 < sources.length) {
      setError(`${message} Trying source ${sourceIndex + 2}.`);
      setSourceIndex(index => index + 1);
    } else {
      setBuffering(false);
      setError('This stream is unavailable right now.');
    }
  }, [clearFailureTimer, sourceIndex, sources.length]);

  const armFailureTimer = useCallback((delay, message) => {
    clearFailureTimer();
    timeoutRef.current = setTimeout(() => failover(message), delay);
  }, [clearFailureTimer, failover]);

  useEffect(() => {
    setSourceIndex(0);
    setError('');
  }, [item?.id]);

  useEffect(() => {
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
    armFailureTimer(STARTUP_TIMEOUT_MS, 'The stream took too long to start.');

    const type = detectStreamType(activeSource.url, activeSource.type || activeSource.source);
    const startPlayback = () => video.play().then(() => { if (!disposed) { setPlaying(true); setBuffering(false); clearFailureTimer(); } }).catch(() => { if (!disposed) setPlaying(false); });

    if (type === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        startLevel: -1,
        capLevelToPlayerSize: true,
        testBandwidth: true,
        abrEwmaDefaultEstimate: isLive ? 1500000 : 2000000,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.65,
        maxBufferLength: isLive ? 18 : 35,
        maxMaxBufferLength: isLive ? 30 : 60,
        backBufferLength: isLive ? 8 : 30,
        maxBufferHole: 0.3,
        lowLatencyMode: false,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 2,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 3,
        xhrSetup: xhr => {
          for (const [name, value] of Object.entries(activeSource.headers || {})) {
            try { xhr.setRequestHeader(name, value); } catch {}
          }
        }
      });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.loadSource(activeSource.url);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels((data.levels || []).map((entry, index) => ({ index, label: entry.height ? `${entry.height}p` : `${Math.round(entry.bitrate / 1000)} kbps` })));
        startPlayback();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        retriesRef.current += 1;
        if (retriesRef.current <= 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); return; }
        if (retriesRef.current <= 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        failover('Playback failed.');
      });
    } else {
      video.src = activeSource.url;
      video.load();
      startPlayback();
    }

    const onWaiting = () => { setBuffering(true); armFailureTimer(REBUFFER_TIMEOUT_MS, 'Playback stalled.'); };
    const onPlaying = () => { setPlaying(true); setBuffering(false); setError(''); clearFailureTimer(); };
    const onPause = () => setPlaying(false);
    const onError = () => failover('The device could not play this source.');
    const onTime = () => { setTime(video.currentTime || 0); setDuration(Number.isFinite(video.duration) ? video.duration : 0); if (!isLive && video.duration > 0 && Math.floor(video.currentTime) % 10 === 0) saveProgress(item, video.currentTime, video.duration); };
    video.addEventListener('waiting', onWaiting); video.addEventListener('playing', onPlaying); video.addEventListener('pause', onPause); video.addEventListener('error', onError); video.addEventListener('timeupdate', onTime);

    return () => {
      disposed = true; clearFailureTimer();
      video.removeEventListener('waiting', onWaiting); video.removeEventListener('playing', onPlaying); video.removeEventListener('pause', onPause); video.removeEventListener('error', onError); video.removeEventListener('timeupdate', onTime);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      video.removeAttribute('src'); video.load();
    };
  }, [activeSource?.url]);

  const close = useCallback(() => onClose?.(time, duration), [onClose, time, duration]);
  const togglePlay = () => { const video = videoRef.current; if (!video) return; if (video.paused) video.play().catch(() => {}); else video.pause(); };
  const chooseLevel = value => { setLevel(value); if (hlsRef.current) hlsRef.current.currentLevel = value; };

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' || event.key === 'GoBack' || event.key === 'Backspace') { event.preventDefault(); close(); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePlay(); }
      else if (!isLive && event.key === 'ArrowRight' && videoRef.current) videoRef.current.currentTime = Math.min(duration || Infinity, videoRef.current.currentTime + 10);
      else if (!isLive && event.key === 'ArrowLeft' && videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, duration, isLive]);

  return <div className="tv-player-container" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#000' }}>
    <video ref={videoRef} playsInline poster={item?.backdrop_url || item?.poster_url || item?.poster || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onClick={togglePlay} />
    <div className="player-osd" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 24, background: 'linear-gradient(180deg,rgba(0,0,0,.75),transparent 35%,transparent 60%,rgba(0,0,0,.8))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><button className="player-btn" onClick={close}><ArrowLeft /></button><div><strong>{item?.title_en || item?.title || 'Playback'}</strong><div style={{ opacity: .7, fontSize: 13 }}>{activeSource?.name || 'Source'}</div></div></div>
      {buffering && <div style={{ alignSelf: 'center', display: 'flex', gap: 10, alignItems: 'center' }}><Loader2 className="spin-animation" /> Loading stream…</div>}
      {error && <div style={{ alignSelf: 'center', background: 'rgba(120,20,20,.9)', padding: '12px 16px', borderRadius: 8 }}>{error}</div>}
      <div><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><button className="player-btn" onClick={togglePlay}>{playing ? <Pause /> : <Play />}</button><button className="player-btn" onClick={() => { if (videoRef.current) { videoRef.current.muted = !videoRef.current.muted; setMuted(videoRef.current.muted); } }}>{muted ? <VolumeX /> : <Volume2 />}</button><button className="player-btn" onClick={() => setShowSettings(value => !value)}><Settings2 /></button><span style={{ marginLeft: 'auto' }}>{isLive ? 'LIVE' : `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2,'0')} / ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2,'0')}`}</span></div>
      {showSettings && <div style={{ marginTop: 12, padding: 12, background: 'rgba(15,23,42,.96)', borderRadius: 8 }}><div style={{ marginBottom: 8 }}>Quality</div><button onClick={() => chooseLevel(-1)} style={{ margin: 4 }}>Auto {level === -1 && <Check size={14} />}</button>{levels.map(entry => <button key={entry.index} onClick={() => chooseLevel(entry.index)} style={{ margin: 4 }}>{entry.label} {level === entry.index && <Check size={14} />}</button>)}{sources.length > 1 && <><div style={{ margin: '12px 0 8px' }}>Sources</div>{sources.map((entry,index) => <button key={entry.id} onClick={() => setSourceIndex(index)} style={{ margin: 4 }}>{entry.name} {sourceIndex === index && <Check size={14} />}</button>)}</>}</div>}</div>
    </div>
  </div>;
}
