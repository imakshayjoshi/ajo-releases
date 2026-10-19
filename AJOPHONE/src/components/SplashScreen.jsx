import React, { useEffect, useState } from 'react';

// v3.17.3: Netflix-style cold-start splash — polished pass.
// Dark stage, breathing green glow, letters land one by one with a tracking
// ease, a hairline accent draws underneath, light sweep across the wordmark,
// then a gentle zoom settles and the whole thing cross-fades into the app.
// ~1.45s total, tap/any key to skip, once per cold start (window flag).
// Content loads underneath in parallel, so home is warm when the splash lifts.
export function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  // v3.17.5: the "ta-dum" — AJO's own synthesized two-hit chime, bundled
  // locally (public/startup.wav, 45KB). WebAudio first (no gesture needed on
  // our WebViews), HTMLAudio fallback, total silence on any failure.
  useEffect(() => {
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
          return;
        }
      } catch {}
      try {
        if (stopped) return;
        const audio = new Audio('/startup.wav');
        audio.volume = 0.85;
        audio.play().catch(() => {});
      } catch {}
    })();
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1200);
    const t2 = setTimeout(() => onDone && onDone(), 1480);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  const skip = () => {
    setLeaving(true);
    setTimeout(() => onDone && onDone(), 220);
  };

  return (
    <div
      className={`ajo-splash${leaving ? ' ajo-splash-leave' : ''}`}
      onClick={skip}
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
