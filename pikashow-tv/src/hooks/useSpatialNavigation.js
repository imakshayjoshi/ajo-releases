import { useEffect, useRef, useCallback } from 'react';

/**
 * Ultra-High Performance 60FPS TV Spatial Navigation
 * Optimized for low-RAM Smart TVs (Fire OS 5/6/7, Android TV)
 * Zero layout thrashing, 0ms latency, handles physical & mobile remotes.
 */
export function useSpatialNavigation({ onBack, isModalOpen = false, modalSelector = null }) {
  const lastFocusedRef = useRef(null);

  // Fast check if an element is focusable and visible without triggering reflow.
  // offsetParent is null for position:fixed and position:sticky elements, so
  // the OSD / player chrome / modals all failed the original check.
  const isElementVisible = (el) => {
    if (!el || el.disabled) return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      if (parseFloat(style.opacity || '1') === 0) return false;
    } catch {
      // ignore — fall through to offsetParent check below
    }
    // offsetParent covers normal flow; check parent chain for fixed/sticky.
    if (el.offsetParent !== null) return true;
    let node = el.parentElement;
    while (node) {
      const pos = (node.style && node.style.position) || '';
      const clsPos = (typeof window !== 'undefined' && node.className && typeof node.className === 'string')
        ? node.className.indexOf('fixed') !== -1 || node.className.indexOf('sticky') !== -1
        : false;
      if (pos === 'fixed' || pos === 'sticky' || clsPos) return true;
      node = node.parentElement;
    }
    return false;
  };

  const getFocusableElements = useCallback((container = document) => {
    const raw = container.querySelectorAll(
      'button:not([disabled]), [tabindex="0"]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), .tv-card, .tv-nav-pill, .tv-hero, .tv-cat-btn, .tv-btn-primary, .tv-btn-secondary, .tv-player-btn, .tv-drawer-item, [data-focusable="true"]'
    );
    const result = [];
    for (let i = 0; i < raw.length; i++) {
      if (isElementVisible(raw[i])) {
        result.push(raw[i]);
      }
    }
    return result;
  }, []);

  const findNextElement = useCallback((current, direction, elements) => {
    if (!current || elements.length === 0) return elements[0] || null;

    // 1. FAST-PATH: Intra-rail horizontal navigation (O(1) sibling traversal)
    if (direction === 'ArrowRight') {
      let sibling = current.nextElementSibling;
      while (sibling) {
        if (elements.includes(sibling)) return sibling;
        sibling = sibling.nextElementSibling;
      }
    } else if (direction === 'ArrowLeft') {
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (elements.includes(sibling)) return sibling;
        sibling = sibling.previousElementSibling;
      }
    }

    // 2. FAST-PATH: Inter-rail vertical navigation
    if (direction === 'ArrowDown' || direction === 'ArrowUp') {
      const currentRail = current.closest('.tv-rail, .tv-header, .tv-hero, .tv-modal-card');

      // v3.9: header <-> content in ONE press. Previously the rail-walk only
      // visited rail SIBLINGS — the header isn't one — so every ArrowUp from
      // content fell through to the slow full-document scan (thousands of
      // elements pre-curation), which felt like dead keypresses.
      const inHeader = !!current.closest('.tv-header');
      if (inHeader && direction === 'ArrowDown') {
        const firstRail = document.querySelector('.tv-main-content .tv-rail, .tv-main-content .tv-hero');
        if (firstRail) {
          const railEls = getFocusableElements(firstRail);
          if (railEls.length > 0) {
            const currentLeft = current.getBoundingClientRect().left;
            let closest = railEls[0];
            let minDiff = Infinity;
            for (const el of railEls) {
              const diff = Math.abs(el.getBoundingClientRect().left - currentLeft);
              if (diff < minDiff) { minDiff = diff; closest = el; }
            }
            return closest;
          }
        }
      }

      if (currentRail) {
        let targetRail = direction === 'ArrowDown'
          ? currentRail.nextElementSibling
          : currentRail.previousElementSibling;

        let exhausted = false;
        while (targetRail) {
          const railElements = getFocusableElements(targetRail);
          if (railElements.length > 0) {
            // Find closest horizontal align in target rail
            const currentLeft = current.getBoundingClientRect().left;
            let closest = railElements[0];
            let minDiff = Infinity;
            for (const el of railElements) {
              const diff = Math.abs(el.getBoundingClientRect().left - currentLeft);
              if (diff < minDiff) {
                minDiff = diff;
                closest = el;
              }
            }
            return closest;
          }
          targetRail = direction === 'ArrowDown'
            ? targetRail.nextElementSibling
            : targetRail.previousElementSibling;
          exhausted = true;
        }

        // Rail walk found nothing above us: snap straight into the header.
        if (exhausted && direction === 'ArrowUp') {
          const headerEls = getFocusableElements(document.querySelector('.tv-header'));
          if (headerEls.length > 0) {
            const currentLeft = current.getBoundingClientRect().left;
            let closest = headerEls[0];
            let minDiff = Infinity;
            for (const el of headerEls) {
              const diff = Math.abs(el.getBoundingClientRect().left - currentLeft);
              if (diff < minDiff) { minDiff = diff; closest = el; }
            }
            return closest;
          }
        }
      }
    }

    // 3. Fallback: 2D Center-Distance Search
    const currentRect = current.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2,
    };

    let bestCandidate = null;
    let minDistance = Infinity;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el === current) continue;
      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;

      let isCandidate = false;
      let primaryDiff = 0;
      let secondaryDiff = 0;

      switch (direction) {
        case 'ArrowUp':
          if (dy < -2) {
            isCandidate = true;
            primaryDiff = Math.abs(dy);
            secondaryDiff = Math.abs(dx);
          }
          break;
        case 'ArrowDown':
          if (dy > 2) {
            isCandidate = true;
            primaryDiff = Math.abs(dy);
            secondaryDiff = Math.abs(dx);
          }
          break;
        case 'ArrowLeft':
          if (dx < -2) {
            isCandidate = true;
            primaryDiff = Math.abs(dx);
            secondaryDiff = Math.abs(dy);
          }
          break;
        case 'ArrowRight':
          if (dx > 2) {
            isCandidate = true;
            primaryDiff = Math.abs(dx);
            secondaryDiff = Math.abs(dy);
          }
          break;
        default:
          break;
      }

      if (isCandidate) {
        const distance = primaryDiff * 1.0 + secondaryDiff * 2.0;
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidate = el;
        }
      }
    }

    return bestCandidate;
  }, [getFocusableElements]);

  /**
   * Focus + Smart Rail Horizontal & Vertical Scrolling.
   * FIX: Never reset scrollLeft on horizontal scroll containers (.tv-rail-track),
   * but smoothly scroll the rail so focused cards are always visible.
   * Only enforce scrollLeft = 0 on the viewport/main scroll container.
   */
  const focusAndScroll = useCallback((el) => {
    try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch (_) {} }

    // 1. Horizontal alignment for rail containers (.tv-rail-track, .tv-filter-bar, etc.)
    const horizontalContainer = el.closest('.tv-rail-track, .tv-filter-bar, .tv-header-nav, [data-horizontal-scroll="true"]');
    if (horizontalContainer) {
      try {
        const er = el.getBoundingClientRect();
        const hr = horizontalContainer.getBoundingClientRect();
        const margin = 72; // Comfortable breathing room from rail edge
        if (er.left < hr.left + margin) {
          horizontalContainer.scrollLeft -= (hr.left + margin - er.left);
        } else if (er.right > hr.right - margin) {
          horizontalContainer.scrollLeft += (er.right - hr.right + margin);
        }
      } catch (_) {}
    }

    // 2. Vertical alignment within the main scroll area
    const scroller = el.closest('.tv-main-content, .tv-modal-scroll') || document.querySelector('.tv-main-content');
    if (scroller) {
      try {
        const er = el.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        if (er.top < sr.top + 24) {
          scroller.scrollTop -= (sr.top + 24 - er.top);
        } else if (er.bottom > sr.bottom - 24) {
          scroller.scrollTop += (er.bottom - sr.bottom + 24);
        }
      } catch (_) {}
    }

    // 3. Keep main layout body from horizontal drift (viewport-level only)
    try {
      if (scroller && scroller.scrollLeft !== 0) scroller.scrollLeft = 0;
      if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
      if (document.body && document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
    } catch (_) {}
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key;
      const keyCode = e.keyCode;

      // 1. Back Key Handling
      if (key === 'Escape' || key === 'Backspace' || keyCode === 4 || keyCode === 27 || keyCode === 8) {
        if (onBack) {
          e.preventDefault();
          e.stopPropagation();
          onBack();
          return;
        }
      }

      // 2. D-Pad Directional Navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key) || [19, 20, 21, 22, 37, 38, 39, 40].includes(keyCode)) {
        // v3.8.2: never steal keys while the user is typing in a text field —
        // arrow-key navigation inside the search input moved caret AND jumped
        // focus to other cards simultaneously.
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
          return;
        }
        let dir = key;
        if (keyCode === 19 || keyCode === 38) dir = 'ArrowUp';
        if (keyCode === 20 || keyCode === 40) dir = 'ArrowDown';
        if (keyCode === 21 || keyCode === 37) dir = 'ArrowLeft';
        if (keyCode === 22 || keyCode === 39) dir = 'ArrowRight';

        const activeContainer = isModalOpen && modalSelector
          ? document.querySelector(modalSelector) || document
          : document;

        const elements = getFocusableElements(activeContainer);
        const current = document.activeElement;

        // Auto-recover lost focus
        if (!current || current === document.body || !elements.includes(current)) {
          if (elements.length > 0) {
            e.preventDefault();
            const target = lastFocusedRef.current && elements.includes(lastFocusedRef.current)
              ? lastFocusedRef.current
              : elements[0];
            focusAndScroll(target);
          }
          return;
        }

        const next = findNextElement(current, dir, elements);
        if (next) {
          e.preventDefault();
          focusAndScroll(next);
          lastFocusedRef.current = next;
        }
      }

      // 3. Enter / OK Selection Key
      // v3.8.2 DOUBLE-INPUT FIX: native form controls (button/a/input/select)
      // synthesize their OWN click on Enter/Space — force-calling .click() here
      // too fired every action twice (on-screen keyboard typed double letters).
      // We only synthesize clicks for non-native focusables (div/span cards).
      if (key === 'Enter' || key === 'Select' || keyCode === 13 || keyCode === 23 || keyCode === 66) {
        const el = document.activeElement;
        if (el && typeof el.click === 'function') {
          const tag = el.tagName;
          const selfActivates =
            tag === 'BUTTON' || tag === 'A' ||
            tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
          if (!selfActivates) el.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onBack, isModalOpen, modalSelector, getFocusableElements, findNextElement]);

  const focusInitial = useCallback((selector = '.tv-card, .tv-nav-pill') => {
    setTimeout(() => {
      const el = document.querySelector(selector);
      if (el) {
        try {
          el.focus({ preventScroll: true });
          // Vertical-only alignment; never horizontal (see focusAndScroll note)
          const scroller = el.closest('.tv-main-content');
          if (scroller) {
            const er = el.getBoundingClientRect();
            const sr = scroller.getBoundingClientRect();
            if (er.top < sr.top || er.bottom > sr.bottom) {
              el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
            }
          }
          lastFocusedRef.current = el;
        } catch (_) {}
      }
    }, 40);
  }, []);

  return { focusInitial };
}
