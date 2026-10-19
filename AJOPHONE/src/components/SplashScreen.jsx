import React, { useEffect, useState } from 'react';

// v3.17.3: Netflix-style cold-start splash — polished pass.
// Dark stage, breathing green glow, letters land one by one with a tracking
// ease, a hairline accent draws underneath, light sweep across the wordmark,
// then a gentle zoom settles and the whole thing cross-fades into the app.
// ~1.45s total, tap/any key to skip, once per cold start (window flag).
// Content loads underneath in parallel, so home is warm when the splash lifts.
export function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

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
