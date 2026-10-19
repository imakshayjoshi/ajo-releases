import React, { useEffect, useState } from 'react';

// v3.9.1: Netflix-style cold-start splash. Dark screen, AJO wordmark draws in
// with a light sweep + subtle zoom, then cross-fades into the app. ~1.35s,
// tap to skip. Renders once per cold start (window flag), never on tab
// switches or player entry. Content loads underneath in parallel, so the home
// screen is already warm when the splash lifts.
export function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1100);
    const t2 = setTimeout(() => onDone && onDone(), 1350);
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
      <div className="ajo-splash-mark">
        <span className="ajo-splash-letter" style={{ animationDelay: '0ms' }}>A</span>
        <span className="ajo-splash-letter" style={{ animationDelay: '90ms' }}>J</span>
        <span className="ajo-splash-letter" style={{ animationDelay: '180ms' }}>O</span>
        <div className="ajo-splash-sweep" />
      </div>
      <div className="ajo-splash-tag">STREAM ANYTHING</div>
    </div>
  );
}
