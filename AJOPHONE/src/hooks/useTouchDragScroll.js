import { useEffect, useRef } from 'react';

/**
 * useTouchDragScroll — bulletproof horizontal drag scroll for Android WebViews.
 *
 * Why: some Android System WebViews silently drop native horizontal touch
 * scrolling for nested overflow-x containers (touch starts on a poster img,
 * composited layers eat the gesture, etc). This hook takes horizontal panning
 * over entirely: the element gets touch-action: pan-y (vertical stays native),
 * and touchmove drives scrollLeft directly with simple momentum on release.
 *
 * Taps still click: drags < 10px never cancel the click; longer drags swallow
 * the trailing click via a one-shot capture listener.
 */
export function useTouchDragScroll(ref) {
  const stateRef = useRef({ down: false, startX: 0, startScroll: 0, lastX: 0, lastT: 0, vel: 0, dragged: false, raf: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = stateRef.current;

    el.style.touchAction = 'pan-y'; // we own horizontal panning

    const onDown = (e) => {
      cancelAnimationFrame(s.raf);
      const t = e.touches[0];
      s.down = true; s.dragged = false;
      s.startX = t.clientX; s.lastX = t.clientX; s.lastT = performance.now();
      s.startScroll = el.scrollLeft; s.vel = 0;
    };

    const onMove = (e) => {
      if (!s.down) return;
      const t = e.touches[0];
      const dx = t.clientX - s.startX;
      if (!s.dragged && Math.abs(dx) > 10) s.dragged = true;
      if (s.dragged) {
        el.scrollLeft = s.startScroll - dx;
        const now = performance.now();
        const dt = Math.max(1, now - s.lastT);
        s.vel = (t.clientX - s.lastX) / dt; // px per ms
        s.lastX = t.clientX; s.lastT = now;
      }
    };

    const onUp = () => {
      if (!s.down) return;
      s.down = false;
      if (!s.dragged) return;
      // swallow the click that follows a drag so cards don't open mid-swipe
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); el.removeEventListener('click', swallow, true); };
      el.addEventListener('click', swallow, true);
      setTimeout(() => el.removeEventListener('click', swallow, true), 350);
      // momentum
      let v = -s.vel * 12; // px per frame
      const decay = () => {
        if (Math.abs(v) < 0.4 || s.down) return;
        el.scrollLeft += v;
        v *= 0.94;
        s.raf = requestAnimationFrame(decay);
      };
      decay();
    };

    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onUp, { passive: true });
    el.addEventListener('touchcancel', onUp, { passive: true });
    return () => {
      cancelAnimationFrame(s.raf);
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onUp);
      el.removeEventListener('touchcancel', onUp);
    };
  }, [ref]);
}
