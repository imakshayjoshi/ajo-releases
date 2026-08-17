import { useEffect, useCallback, useRef } from 'react';

/**
 * Android TV / Google TV 2D Spatial D-Pad Navigation Hook
 * Handles buttery-smooth scrolling, focus isolation, and viewport management.
 */
export function useSpatialNavigation({
  enabled = true,
  onBack,
} = {}) {
  const lastFocusedRef = useRef(null);

  // Identify active focus container (Modal, Settings Drawer, or Main Viewport)
  const getActiveRoot = useCallback(() => {
    const activeOverlay = document.querySelector('.modal-card, .modal-backdrop, .player-settings-drawer, .player-channel-drawer');
    return activeOverlay || document;
  }, []);

  // Retrieve all visible focusable elements inside the active root
  const getFocusableElements = useCallback(() => {
    const root = getActiveRoot();
    const elements = Array.from(root.querySelectorAll('[data-focusable="true"], button, [tabindex="0"], a, input'));

    return elements.filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        !el.hasAttribute('disabled')
      );
    });
  }, [getActiveRoot]);

  // Navigate to closest element in given direction (up, down, left, right)
  const navigateDirection = useCallback((direction) => {
    const focusables = getFocusableElements();
    if (focusables.length === 0) return;

    const activeEl = document.activeElement;
    const isInsideActiveRoot = activeEl && focusables.includes(activeEl);

    if (!isInsideActiveRoot) {
      const primaryBtn = focusables.find(el => 
        el.classList.contains('gtv-hero-play-btn') || 
        el.classList.contains('gtv-pill-active') || 
        el.classList.contains('tv-btn-primary')
      ) || focusables[0];
      
      if (primaryBtn) {
        primaryBtn.focus();
      }
      return;
    }

    const currentRect = activeEl.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2,
    };

    let bestCandidate = null;
    let shortestDistance = Infinity;

    focusables.forEach(candidate => {
      if (candidate === activeEl) return;

      const rect = candidate.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;

      let isValidDirection = false;
      let primaryDiff = 0;
      let secondaryDiff = 0;

      switch (direction) {
        case 'up':
          isValidDirection = dy < -6;
          primaryDiff = Math.abs(dy);
          secondaryDiff = Math.abs(dx);
          break;
        case 'down':
          isValidDirection = dy > 6;
          primaryDiff = Math.abs(dy);
          secondaryDiff = Math.abs(dx);
          break;
        case 'left':
          isValidDirection = dx < -6;
          primaryDiff = Math.abs(dx);
          secondaryDiff = Math.abs(dy);
          break;
        case 'right':
          isValidDirection = dx > 6;
          primaryDiff = Math.abs(dx);
          secondaryDiff = Math.abs(dy);
          break;
      }

      if (isValidDirection) {
        // Bias heavily along primary navigation axis to avoid diagonal hopping
        const score = primaryDiff + (secondaryDiff * 2.2);
        if (score < shortestDistance) {
          shortestDistance = score;
          bestCandidate = candidate;
        }
      }
    });

    if (bestCandidate) {
      bestCandidate.focus();
      lastFocusedRef.current = bestCandidate;

      // Smart Viewport Scrolling for Google TV
      const scrollContainer = document.querySelector('.gtv-main-scroll-container, .tv-main-content');
      const isTopNav = bestCandidate.closest('.gtv-top-header');
      const isHeroElement = bestCandidate.closest('.gtv-hero-section, .tv-hero');
      const railScroll = bestCandidate.closest('.rail-items-scroll, .gtv-apps-scroll, .search-chips-row');
      
      // Auto-scroll horizontal rail to keep card visible
      if (railScroll) {
        const cardRect = bestCandidate.getBoundingClientRect();
        const railRect = railScroll.getBoundingClientRect();
        if (cardRect.left < railRect.left + 40 || cardRect.right > railRect.right - 40) {
          bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }

      if (isTopNav && scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (isHeroElement && scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const railSection = bestCandidate.closest('.tv-rail-section, .media-rail');
        if (railSection && scrollContainer) {
          railSection.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } else {
          bestCandidate.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        }
      }
    }
  }, [getFocusableElements]);

  // Auto-focus on container change
  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => {
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        const activeEl = document.activeElement;
        if (!activeEl || !focusables.includes(activeEl)) {
          const defaultTarget = focusables.find(el => 
            el.classList.contains('gtv-hero-play-btn') || 
            el.classList.contains('gtv-pill-active')
          ) || focusables[0];
          
          if (defaultTarget) {
            defaultTarget.focus();
          }
        }
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [enabled, getFocusableElements]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // When TV Player is active, TVPlayer manages its own keys
      const playerActive = document.querySelector('.tv-player-container');
      if (playerActive) return;

      const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

      switch (e.key) {
        case 'ArrowUp':
        case 'Up':
          if (!isInput || e.altKey) {
            e.preventDefault();
            navigateDirection('up');
          }
          break;
        case 'ArrowDown':
        case 'Down':
          if (!isInput || e.altKey) {
            e.preventDefault();
            navigateDirection('down');
          }
          break;
        case 'ArrowLeft':
        case 'Left':
          if (!isInput || e.target.selectionStart === 0) {
            e.preventDefault();
            navigateDirection('left');
          }
          break;
        case 'ArrowRight':
        case 'Right':
          if (!isInput || e.target.selectionEnd === e.target.value.length) {
            e.preventDefault();
            navigateDirection('right');
          }
          break;
        case 'Enter':
        case 'Select':
        case ' ':
          if (!isInput && document.activeElement) {
            e.preventDefault();
            document.activeElement.click();
          }
          break;
        case 'Escape':
        case 'Backspace':
        case 'GoBack':
          if (onBack) {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [enabled, navigateDirection, onBack]);

  return { navigateDirection, getFocusableElements };
}
