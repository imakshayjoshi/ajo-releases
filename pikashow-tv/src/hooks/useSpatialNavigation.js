import { useCallback, useEffect, useRef } from 'react';

export function useSpatialNavigation({ enabled = true, onBack } = {}) {
  const cacheRef = useRef({ root: null, items: [], at: 0 });
  const getRoot = useCallback(() => document.querySelector('.modal-card, .player-settings-drawer, .player-channel-drawer') || document, []);
  const getFocusableElements = useCallback(() => {
    const root = getRoot(); const now = performance.now();
    if (cacheRef.current.root === root && now - cacheRef.current.at < 250) return cacheRef.current.items;
    const items = [...root.querySelectorAll('[data-focusable="true"],button,[tabindex="0"],a,input')].filter(element => !element.disabled && element.getClientRects().length > 0);
    cacheRef.current = { root, items, at: now }; return items;
  }, [getRoot]);
  const move = useCallback(direction => {
    const items = getFocusableElements(); if (!items.length) return;
    const active = items.includes(document.activeElement) ? document.activeElement : items[0];
    if (active !== document.activeElement) { active.focus(); return; }
    const origin = active.getBoundingClientRect(); const ox = origin.left + origin.width / 2; const oy = origin.top + origin.height / 2; let best = null; let bestScore = Infinity;
    for (const item of items) { if (item === active) continue; const rect = item.getBoundingClientRect(); const dx = rect.left + rect.width / 2 - ox; const dy = rect.top + rect.height / 2 - oy; const valid = direction === 'left' ? dx < -4 : direction === 'right' ? dx > 4 : direction === 'up' ? dy < -4 : dy > 4; if (!valid) continue; const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy); const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx); const score = primary + secondary * 2.5; if (score < bestScore) { bestScore = score; best = item; } }
    if (best) { best.focus(); best.scrollIntoView({behavior:'auto',block:'nearest',inline:'center'}); }
  }, [getFocusableElements]);
  useEffect(() => { if (!enabled) return; const handler = event => { if (document.querySelector('.tv-player-container')) return; const map = {ArrowLeft:'left',Left:'left',ArrowRight:'right',Right:'right',ArrowUp:'up',Up:'up',ArrowDown:'down',Down:'down'}; if (map[event.key]) { event.preventDefault(); move(map[event.key]); } else if (['Enter','Select',' '].includes(event.key) && document.activeElement) { event.preventDefault(); document.activeElement.click(); } else if (['Escape','Backspace','GoBack'].includes(event.key)) { event.preventDefault(); onBack?.(); } }; window.addEventListener('keydown',handler,true); const timer=setTimeout(()=>getFocusableElements()[0]?.focus(),80); return()=>{clearTimeout(timer);window.removeEventListener('keydown',handler,true);}; }, [enabled,getFocusableElements,move,onBack]);
  return { navigateDirection: move, getFocusableElements };
}
