import React, { useEffect, useRef, useState } from 'react';

// v3.17.18: launch = the AJO logo-reveal FILM (public/logo-reveal.mp4, 6s,
// 1080p, own audio). Plays once per cold start (App gates on
// window.__ajoSplashShown). Any key / tap / click skips with a quick fade.
// If the video can't play (asset missing, codec hiccup), the original CSS
// wordmark splash takes over automatically, so launch can never black-screen.
// Hard cap: 9s no matter what the video does.
export function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef(null);
  const doneRef = useRef(false);

  const finish = (fadeMs = 320) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    setTimeout(() => onDone && onDone(), fadeMs);
  };

  // Hard cap — a stalled video must never trap the launch.
  useEffect(() => {
    const t = setTimeout(() => finish(200), 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skip on any remote key / tap.
  useEffect(() => {
    const onKey = () => finish(200);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoplay policy: the Android WebView allows sound (mediaPlaybackRequiresUserGesture=false),
  // but anywhere it's blocked the reveal must still PLAY — retry muted instead
  // of freezing on frame 0 until the hard cap.
  useEffect(() => {
    if (videoFailed) return;
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.play().catch(() => {
        try { v.muted = true; } catch {}
        v.play().catch(() => {});
      });
    };
    if (v.readyState >= 2) tryPlay();
    v.addEventListener('canplay', tryPlay, { once: true });
    return () => v.removeEventListener('canplay', tryPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFailed]);

  // Stall detector: on boxes where the WebView can't decode the video the
  // element sits on a gray placeholder until the 9s cap — unacceptable at
  // launch. If currentTime hasn't advanced after 2.5s, drop to the CSS splash.
  useEffect(() => {
    if (videoFailed) return;
    const t = setTimeout(() => {
      const v = videoRef.current;
      if (v && v.currentTime < 0.1) setVideoFailed(true);
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFailed]);

  // Fallback chime for the CSS-splash path (video missing/broken).
  useEffect(() => {
    if (!videoFailed) return;
    let stopped = false;
    (async () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const buf = await ctx.decodeAudioData(await (await fetch('/startup.wav')).arrayBuffer());
          if (stopped) return;
          const src = ctx.createBufferSource();
          const gain = ctx.createGain();
          gain.gain.value = 0.85;
          src.buffer = buf;
          src.connect(gain).connect(ctx.destination);
          src.start(0);
          src.onended = () => { try { ctx.close(); } catch {} };
        }
      } catch {}
    })();
    const t = setTimeout(() => finish(280), 1480);
    return () => { stopped = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFailed]);

  if (!videoFailed) {
    return (
      <div
        className={`ajo-splash ajo-splash-video${leaving ? ' ajo-splash-leave' : ''}`}
        onClick={() => finish(200)}
        aria-label="AJO"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}
      >
        <video
          ref={videoRef}
          src="/logo-reveal.mp4"
          autoPlay
          playsInline
          onEnded={() => finish(320)}
          onError={() => setVideoFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
        />
      </div>
    );
  }

  // Original CSS wordmark splash (fallback only)
  return (
    <div
      className={`ajo-splash${leaving ? ' ajo-splash-leave' : ''}`}
      onClick={() => finish(220)}
      aria-label="AJO"
    >
      <div className="ajo-splash-glow" />
      <div className="ajo-splash-mark">
        <span className="ajo-splash-letter" style={{ animationDelay: '0ms' }}>A</span>
        <span className="ajo-splash-letter" style={{ animationDelay: '100ms' }}>J</span>
        <span className="ajo-splash-letter" style={{ animationDelay: '200ms' }}>O</span>
        <div className="ajo-splash-sweep" />
      </div>
      <div className="ajo-splash-rule" />
      <div className="ajo-splash-tag">STREAM ANYTHING</div>
    </div>
  );
}
