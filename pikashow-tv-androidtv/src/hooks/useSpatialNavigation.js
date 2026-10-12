import { useEffect, useRef, useCallback } from 'react';

/**
 * Ultra-High Performance 60FPS TV Spatial Navigation
 * Optimized for low-RAM Smart TVs (Fire OS 5/6/7, Android TV)
 * Zero layout thrashing, 0ms latency, handles physical & mobile remotes.
 */
export function useSpatialNavigation({ onBack, isModalOpen = false, modalSelector = null }) {
  const lastFocusedRef = useRef(null);
  // v3.12.84: dock model state. The nav is a position:fixed BOTTOM capsule, so
  // the engine must know (a) which CONTENT element to return to when the user
  // presses UP from the dock, and (b) the last focused rect for nearest-
  // neighbor recovery when a grid re-render unmounts the focused card.
  const lastContentRef = useRef(null);
  const lastRectRef = useRef(null);

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
    if (!container) return []; // v3.12.84: guard — dock helpers query .tv-header which may be absent mid-render
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

    // v3.12.84: dock helpers. The nav is a BOTTOM-anchored capsule, so:
    //  - content bottom edge + DOWN = the only way INTO the dock
    //  - UP from the dock returns to the content element you came from
    //  - the dock never wins a geometric scan mid-page (that was the jumping)
    const dockPillNear = (fromEl) => {
      const headerEls = getFocusableElements(document.querySelector('.tv-header'));
      const pool = headerEls.filter((el) => elements.includes(el));
      if (!pool.length) return null;
      const active = pool.find((el) => el.classList && el.classList.contains('tv-nav-pill') && el.classList.contains('active'));
      if (active) return active;
      const fr = fromEl ? fromEl.getBoundingClientRect() : null;
      const fx = fr ? fr.left + fr.width / 2 : window.innerWidth / 2;
      let best = pool[0], bd = Infinity;
      for (const p of pool) {
        const r = p.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - fx);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    const contentReturnTarget = () => {
      if (lastContentRef.current && elements.includes(lastContentRef.current)) return lastContentRef.current;
      // nearest content element to the last known focus rect, else first in main
      const main = document.querySelector('.tv-main-content');
      if (!main) return null;
      const mainEls = getFocusableElements(main).filter((el) => elements.includes(el));
      if (!mainEls.length) return null;
      if (lastRectRef.current) {
        const lr = lastRectRef.current;
        let best = mainEls[0], bd = Infinity;
        for (const el of mainEls) {
          const r = el.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - lr.x) + Math.abs(r.top + r.height / 2 - lr.y);
          if (d < bd) { bd = d; best = el; }
        }
        return best;
      }
      return mainEls[0];
    };

    // v3.12.84: dock fast-path. The header capsule sits at the BOTTOM of the
    // screen. LEFT/RIGHT move inside it; UP returns to content; DOWN stays.
    const inHeaderZone = current.closest('.tv-header');
    if (inHeaderZone) {
      if (current.closest('.tv-logo-section')) {
        if (direction === 'ArrowRight') {
          const pill = document.querySelector('.tv-header .tv-nav-pill.active') || document.querySelector('.tv-header .tv-nav-pill');
          if (pill) return pill;
        }
      } else if (current.closest('.tv-nav-pills')) {
        const pills = Array.from(document.querySelectorAll('.tv-header .tv-nav-pill'));
        const idx = pills.indexOf(current);
        if (direction === 'ArrowLeft' && idx <= 0) {
          const logo = document.querySelector('.tv-header .tv-logo-badge');
          if (logo) return logo;
        }
        if (direction === 'ArrowLeft' && idx > 0) return pills[idx - 1];
        if (direction === 'ArrowRight' && idx >= 0 && idx < pills.length - 1) return pills[idx + 1];
      }
      if (direction === 'ArrowUp') {
        const back = contentReturnTarget();
        if (back) return back;
      }
      // DOWN from the dock: nothing below — stay. Any other unhandled key: stay.
      return current;
    }

    // v3.12.81/84: Settings tab fast-paths. Cards walk cleanly card-to-card;
    // the top edge goes to the OTA banner (visually above), never to the
    // bottom dock; the bottom edge drops into the dock deliberately.
    const settingsCard = current.closest('.tv-settings-card');
    if (settingsCard && (direction === 'ArrowUp' || direction === 'ArrowDown')) {
      if (direction === 'ArrowDown') {
        let nxt = settingsCard.nextElementSibling;
        while (nxt) {
          if (nxt.classList && nxt.classList.contains('tv-settings-card')) {
            const els = getFocusableElements(nxt);
            if (els.length > 0) return els[0];
          }
          nxt = nxt.nextElementSibling;
        }
        // bottom of settings → the dock
        const dock = dockPillNear(current);
        if (dock) return dock;
        return current;
      }
      // ArrowUp: previous card, else the OTA banner (it renders ABOVE the
      // content pane), else stay at the top card — the dock is DOWN, not UP.
      let prv = settingsCard.previousElementSibling;
      while (prv) {
        if (prv.classList && prv.classList.contains('tv-settings-card')) {
          const els = getFocusableElements(prv);
          if (els.length > 0) return els[0];
        }
        prv = prv.previousElementSibling;
      }
      const banner = document.querySelector('.tv-ota-rail');
      if (banner) {
        const be = getFocusableElements(banner).filter((el) => elements.includes(el));
        if (be.length > 0) return be[0];
      }
      return current;
    }

    // v3.12.79: Live TV grid horizontal edges. LEFT at the leftmost grid
    // column → category rail (and back). Without this, LEFT/RIGHT fell to the
    // 2D scan which sometimes picked the toolbar and made focus feel jumpy.
    if (direction === 'ArrowLeft' && current.closest('.live-channel-grid')) {
      const rail = document.querySelector('.live-cat-rail .live-cat-btn.active') || document.querySelector('.live-cat-rail .live-cat-btn');
      if (rail) return rail;
    }
    if (direction === 'ArrowRight' && current.closest('.live-cat-rail')) {
      const firstCard = document.querySelector('.live-channel-grid .tv-card-live');
      if (firstCard) return firstCard;
    }
    if (direction === 'ArrowLeft' && current.closest('.live-cat-rail')) {
      // v3.12.86: the rail is the leftmost element on the screen — the generic
      // sibling fast-path would otherwise walk UP the category list on a LEFT
      // press (a sideways key moving focus vertically is pure confusion).
      return current;
    }

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
      // v3.12.76: the live grid cards live inside .live-view-shell (a flex row),
      // so the rail-walk never finds the toolbar by sibling traversal — the
      // closest() "rail" is the INNER .live-channel-grid, whose siblings are
      // the cat rail and the grid scroller, not the toolbar. Handle the Live
      // TV stack explicitly before the generic rail walk.
      const inLiveArea = current.closest('.live-channel-grid, .live-cat-rail, .live-toolbar');
      if (inLiveArea) {
        // v3.12.86: the category rail is a VERTICAL stack of buttons, but the
        // rail-walk below treats .live-cat-rail as a container and jumps to its
        // SIBLING (the grid) — so DOWN from "All Channels" bounced to a channel
        // card and Sports/News/Entertainment were unreachable (Akkshay report).
        // Walk WITHIN the rail first.
        const catBtn = current.closest('.live-cat-btn');
        if (catBtn && current.closest('.live-cat-rail')) {
          if (direction === 'ArrowDown') {
            let s = catBtn.nextElementSibling;
            while (s && !elements.includes(s)) s = s.nextElementSibling;
            if (s) return s;
            // last category: fall through (lands in the grid via the scan)
          }
          if (direction === 'ArrowUp') {
            let s = catBtn.previousElementSibling;
            while (s && !elements.includes(s)) s = s.previousElementSibling;
            if (s) return s;
            // first category ("All Channels"): fall through to the toolbar below
          }
        }
        if (direction === 'ArrowUp') {
          // Grid card or rail item → toolbar first. v3.12.84: from the toolbar,
          // UP stays on the toolbar — the nav is a BOTTOM dock, so jumping to
          // it from the TOP of the live screen was pure confusion.
          if (!current.closest('.live-toolbar')) {
            const toolbar = document.querySelector('.tv-main-content .live-toolbar');
            if (toolbar) {
              const tbEls = getFocusableElements(toolbar);
              if (tbEls.length > 0) {
                const currentLeft = current.getBoundingClientRect().left;
                let closestTb = tbEls[0];
                let minTbDiff = Infinity;
                for (const el of tbEls) {
                  const diff = Math.abs(el.getBoundingClientRect().left - currentLeft);
                  if (diff < minTbDiff) { minTbDiff = diff; closestTb = el; }
                }
                return closestTb;
              }
            }
          }
          return current; // top of the live area — stay
        }
        if (direction === 'ArrowDown' && current.closest('.live-toolbar')) {
          // Toolbar → first grid card (skip the category rail: LEFT/RIGHT
          // already moves between rail and grid on the horizontal plane).
          const firstCard = document.querySelector('.live-channel-grid .tv-card-live');
          if (firstCard) return firstCard;
        }
        // v3.12.79: edge guards so focus never escapes the live area and jumps
        // to the toolbar/header when there's genuinely no adjacent channel.
        // DOWN on the last grid row (or bottom rail item) → stay put.
        if (direction === 'ArrowDown' && (current.closest('.live-channel-grid') || current.closest('.live-cat-rail'))) {
          // The 2D fallback below may still find a lower channel; only if it
          // finds NOTHING do we stop here (see the post-fallback guard).
        }
        // Grid vertical movement is handled by the 2D fallback below.
      }
      // v3.12.84: the old inHeader ArrowDown branch (header → first content
      // rail) is dead code — the dock fast-path at the top handles every key
      // for header elements and returns before we get here.
      const currentRail = current.closest('.tv-rail, .tv-header, .tv-hero, .tv-modal-card, .live-toolbar, .live-cat-rail, .live-channel-grid, .tv-settings-card');

      if (currentRail) {
        let targetRail = direction === 'ArrowDown'
          ? currentRail.nextElementSibling
          : currentRail.previousElementSibling;

        // v3.12.84: exhausted must mean "the walk found nothing in this
        // direction" — including when there are NO siblings at all (the old
        // loop left it false, so top/bottom edge handling never fired for a
        // lone first/last rail).
        let exhausted = true;
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

        // Rail walk exhausted. v3.12.84: the nav is a BOTTOM dock — UP at the
        // top of content must NOT dive into it (the "focus jumps to the bottom
        // nav" complaint). UP → live toolbar → OTA banner → stay. DOWN at the
        // bottom edge → the dock (deliberate, nearest pill by x).
        if (exhausted && direction === 'ArrowUp') {
          const toolbar = document.querySelector('.tv-main-content .live-toolbar');
          if (toolbar) {
            const tbEls = getFocusableElements(toolbar);
            if (tbEls.length > 0) {
              const currentLeft = current.getBoundingClientRect().left;
              let closestTb = tbEls[0];
              let minTbDiff = Infinity;
              for (const el of tbEls) {
                const diff = Math.abs(el.getBoundingClientRect().left - currentLeft);
                if (diff < minTbDiff) { minTbDiff = diff; closestTb = el; }
              }
              return closestTb;
            }
          }
          const banner = document.querySelector('.tv-ota-rail');
          if (banner) {
            const bannerEls = getFocusableElements(banner).filter((el) => elements.includes(el));
            if (bannerEls.length > 0) {
              const currentLeft = current.getBoundingClientRect().left;
              let closestBanner = bannerEls[0];
              let minBannerDiff = Infinity;
              for (const el of bannerEls) {
                const diff = Math.abs(el.getBoundingClientRect().left - currentLeft);
                if (diff < minBannerDiff) { minBannerDiff = diff; closestBanner = el; }
              }
              return closestBanner;
            }
          }
          return current; // top edge — stay put, the dock is DOWN
        }
        if (exhausted && direction === 'ArrowDown') {
          // Deliberately fall through to the 2D scan — it may find a lower
          // element (hero CTAs have no rail siblings). The dock is entered via
          // the post-scan fallback only when nothing exists below.
        }
      }
    }

    // 3. Fallback: 2D Center-Distance Search
    const currentRect = current.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2,
    };

    // v3.12.79: constrain the live-area scan so DOWN from the grid/rail can't
    // leap to the toolbar or bottom nav — only other channels/category items
    // are valid targets. Stops the "focus jumps here and there" report.
    const inLiveGridOrRail = current.closest('.live-channel-grid, .live-cat-rail');
    let liveGridEls = null;
    if (inLiveGridOrRail && (direction === 'ArrowDown' || direction === 'ArrowUp')) {
      const scope = current.closest('.live-view-shell');
      if (scope) {
        liveGridEls = Array.from(scope.querySelectorAll('.live-channel-grid .tv-card-live, .live-cat-rail .live-cat-btn'))
          .filter((el) => el !== current && !el.disabled && el.offsetParent !== null);
      }
    }
    // v3.12.84: the dock is position:fixed at the BOTTOM of the viewport, so
    // geometrically it is "below" EVERYTHING — the 2D scan kept snapping to it
    // from the middle of the page (the "focus jumps for no reason" complaint).
    // Dock entry is only via the explicit bottom-edge fallback after the scan.
    let scanEls = liveGridEls || elements;
    if (!inHeaderZone) {
      scanEls = scanEls.filter((el) => !el.closest('.tv-header'));
    }

    let bestCandidate = null;
    let minDistance = Infinity;

    for (let i = 0; i < scanEls.length; i++) {
      const el = scanEls[i];
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

    // v3.12.84: bottom edge of content = the ONLY way into the dock. The scan
    // above excluded dock elements, so "nothing found below" means the user is
    // genuinely at the bottom of the page — land on the nearest nav pill.
    if (!bestCandidate && direction === 'ArrowDown' && !inHeaderZone) {
      const dock = dockPillNear(current);
      if (dock && dock !== current) return dock;
    }

    // v3.12.79: in the live area, pressing DOWN with no channel below stays
    // put — never escapes to the toolbar (the dock fallback above handles the
    // deliberate bottom-edge case).
    if (!bestCandidate && inLiveGridOrRail && direction === 'ArrowDown') return current;

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
    // v3.12.75: .live-cat-rail is the Live TV category strip. On the Lumio it
    // renders HORIZONTAL (overflow-x) because the media query at max-width:
    // 960px flips the shell — the strip now scrolls with the focused chip.
    const horizontalContainer = el.closest('.tv-rail-track, .tv-filter-bar, .tv-header-nav, .live-cat-rail, .tv-provider-row, [data-horizontal-scroll="true"]');
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
    // v3.12.84 (pane-jump fix): the nav dock is position:fixed at the BOTTOM,
    // outside .tv-main-content. The old `|| document.querySelector('.tv-main-content')`
    // fallback scrolled the page for elements that were never inside it — every
    // keypress on the dock dragged the content pane ("the screen pane moves for
    // no reason"). Only scroll a container the element actually lives in.
    const isLiveCard = el.closest && el.closest('.live-channel-grid, .live-cat-rail');
    const scroller = isLiveCard
      ? el.closest('.tv-main-content')
      : el.closest('.tv-main-content, .tv-modal-body, .tv-player-drawer, .tv-modal-scroll, .live-grid-scroll, .live-cat-rail');
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
      // v3.10.0 FIX: Backspace (keyCode 8) must NOT act as remote Back while
      // the user is typing in a text field — it would navigate home and wipe
      // their search. Only KEYCODE_BACK (4) and Escape are global Back.
      const ae = document.activeElement;
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') && ae.value.length > 0;
      const isGlobalBack = key === 'Escape' || keyCode === 4 || keyCode === 27;
      const isTypingBackspace = typing && (key === 'Backspace' || keyCode === 8);
      if ((isGlobalBack || (key === 'Backspace' || keyCode === 8)) && onBack) {
        if (isTypingBackspace) return; // let the field delete characters
        e.preventDefault();
        e.stopPropagation();
        onBack();
        return;
      }

      // 2. D-Pad Directional Navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key) || [19, 20, 21, 22, 37, 38, 39, 40].includes(keyCode)) {
        // Normalize keyCode to direction string FIRST so `dir` is available
        // for the INPUT/TEXTAREA guard below (v3.12.4 TDZ fix).
        let dir = key;
        if (keyCode === 19 || keyCode === 38) dir = 'ArrowUp';
        if (keyCode === 20 || keyCode === 40) dir = 'ArrowDown';
        if (keyCode === 21 || keyCode === 37) dir = 'ArrowLeft';
        if (keyCode === 22 || keyCode === 39) dir = 'ArrowRight';

        // v3.8.2 base rule; v3.10.0 refinement: while typing in a text field,
        // LEFT/RIGHT move the caret (swallow them), but UP/DOWN fall through
        // to spatial navigation so the user can actually leave the search
        // input on a D-pad-only remote (previously the field was a focus
        // trap — you could never reach the results grid or keyboard).
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
          if (dir === 'ArrowLeft' || dir === 'ArrowRight') return;
          // Up/Down: fall through to spatial nav below
        }

        const activeContainer = isModalOpen && modalSelector
          ? document.querySelector(modalSelector) || document
          : document;

        const elements = getFocusableElements(activeContainer);
        const current = document.activeElement;

        // Auto-recover lost focus
        if (!current || current === document.body || !elements.includes(current)) {
          if (elements.length > 0) {
            e.preventDefault();
            let target = lastFocusedRef.current && elements.includes(lastFocusedRef.current)
              ? lastFocusedRef.current
              : null;
            if (!target && lastRectRef.current) {
              // v3.12.84: nearest-neighbor recovery. When a grid re-render
              // unmounts the focused card, snapping to the dock pill (or
              // elements[0]) is the "focus jumps to a random place" bug.
              // Focus whatever is closest to where focus WAS instead.
              const lr = lastRectRef.current;
              let bd = Infinity;
              for (const el of elements) {
                if (el.closest('.tv-header')) continue; // never recover INTO the dock
                const r = el.getBoundingClientRect();
                const d = Math.abs(r.left + r.width / 2 - lr.x) + Math.abs(r.top + r.height / 2 - lr.y);
                if (d < bd) { bd = d; target = el; }
              }
            }
            if (!target) {
              // Last resort: the first CONTENT element (never the dock).
              target = elements.find((el) => !el.closest('.tv-header')) || null;
            }
            focusAndScroll(target || elements[0]);
            if (target && !target.closest('.tv-header')) lastContentRef.current = target;
            lastFocusedRef.current = target || elements[0];
          }
          return;
        }

        const next = findNextElement(current, dir, elements);
        if (next) {
          e.preventDefault();
          focusAndScroll(next);
          lastFocusedRef.current = next;
          // v3.12.84: track where focus is + the last CONTENT element, so the
          // dock's UP can return to it and recovery can stay in-neighborhood.
          try {
            const r = next.getBoundingClientRect();
            lastRectRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          } catch (_) {}
          if (!next.closest('.tv-header')) lastContentRef.current = next;
        } else if (dir === 'ArrowLeft' || dir === 'ArrowRight') {
          // v3.12.79 ColorOS elastic edge: at the end of a rail, stretch the
          // track 16px along the swipe vector, then snap back on release.
          const track = current.closest && current.closest('.tv-rail-track, .tv-provider-row');
          if (track) {
            e.preventDefault();
            const amt = dir === 'ArrowRight' ? '-16px' : '16px';
            track.style.setProperty('--stretch', amt);
            const onUp = (ev) => {
              const kc = ev.keyCode;
              if (kc === 21 || kc === 22 || kc === 37 || kc === 39) {
                track.style.setProperty('--stretch', '0px');
                window.removeEventListener('keyup', onUp, true);
              }
            };
            window.addEventListener('keyup', onUp, true);
            // Safety: clear even if keyup is missed (remote repeat quirks).
            setTimeout(() => track.style.setProperty('--stretch', '0px'), 600);
          }
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
