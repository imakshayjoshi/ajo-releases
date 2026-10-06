import React, { useEffect, useRef, useState } from 'react';

/**
 * v3.12.59 PREMIUM — Ambient Backdrop [Apple TV pattern, spec §6.1].
 *
 * The focused rail's key artwork, blurred, sits full-screen BEHIND the rails
 * at low opacity, swapping with a 700ms ease-hero fade when the focused row
 * changes. ONE blurred element per screen (GPU budget: 1GB Fire TV Stick).
 *
 * - Down-scaled source: blur cost scales with pixels, so we render the image
 *   at ~320px wide regardless of screen size.
 * - Row-change-only updates: the parent passes `artUrl` derived from the
 *   focused row's first item; we debounce swaps so key-repeat navigation
 *   never thrashes the layer.
 * - Hidden entirely in the player and on modal screens (parent controls).
 */
export function AmbientBackdrop({ artUrl, enabled = true }) {
  const [shownUrl, setShownUrl] = useState(null);
  const swapTimer = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (swapTimer.current) clearTimeout(swapTimer.current);
    if (!artUrl) {
      setShownUrl(null);
      return;
    }
    // v3.12.59: debounce the swap — during D-pad row-hopping we only repaint
    // once focus settles (300ms of no change).
    swapTimer.current = setTimeout(() => {
      setShownUrl(artUrl);
    }, 300);
    return () => { if (swapTimer.current) clearTimeout(swapTimer.current); };
  }, [artUrl, enabled]);

  if (!enabled || !shownUrl) {
    return <div className="ambient-backdrop ambient-hidden" aria-hidden="true" />;
  }

  return (
    <div
      className="ambient-backdrop"
      aria-hidden="true"
      style={{
        backgroundImage: `url(${shownUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        // down-scale trick: paint the image small; CSS blur + scale cover it
        imageRendering: 'auto',
      }}
      ref={imgRef}
    />
  );
}

export default AmbientBackdrop;
