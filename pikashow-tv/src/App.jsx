import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getBollywoodCatalog, getHollywoodCatalog, getSerialsCatalog, getLiveBroadcasts } from './api/pikashow';
import { getLiveSportsEvents } from './api/sports';
import { getWatchHistory, saveProgress } from './api/history';
import { checkForAppUpdates } from './api/otaUpdate';
import { getTmdbTrending, getTmdbCatalog, getTmdbNowPlaying, getBecauseYouWatched } from './api/tmdb';
import { getRankedServers } from './api/mirrorHealth';
import { getAddonCatalogs, getAddonStreams } from './api/stremio';
import { GoogleTVHeader } from './components/GoogleTVHeader';
import { MediaRail } from './components/MediaRail';
import { MediaGridView } from './components/MediaGridView';
import { MediaDetailsModal } from './components/MediaDetailsModal';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { TVPlayer } from './components/TVPlayer';
import { useSpatialNavigation } from './hooks/useSpatialNavigation';
import { shouldPreferNativePlayer, playInNativePlayer, isNativePlaybackActive, nativePlayerControl, setNativePlaybackActive } from './utils/nativePlayer';
import { generateUniversalServers } from './utils/streamingEngines';
// v3.9.0 PERF: castSync lazy-loaded — the 27KB module was parsed eagerly on
// every startup even though cast is only used when a phone is actually paired.
import { Play, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'home');
  const [loading, setLoading] = useState(true);

  // Catalogs
  const [bollywoodItems, setBollywoodItems] = useState([]);
  const [hollywoodItems, setHollywoodItems] = useState([]);
  const [seriesItems, setSeriesItems] = useState([]);
  const [sportsItems, setSportsItems] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [tmdbTrending, setTmdbTrending] = useState([]);
  const [tmdbMovies, setTmdbMovies] = useState([]);
  const [tmdbSeries, setTmdbSeries] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  // v3.11.0: IPTV (9+ playlists) is heavy — load it AFTER first paint so the
  // app opens fast on low-RAM Fire TV sticks instead of blocking on playlists.
  const [liveItems, setLiveItems] = useState([]);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [addonCatalogItems, setAddonCatalogItems] = useState([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState([]);
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ajo_watchlist_v1') || '[]'); } catch { return []; }
  });

  // Active Modals / Player
  const [selectedItem, setSelectedItem] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null); // { item, server, episodes, episodeIndex }
  const [otaPrompt, setOtaPrompt] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);

  // v3.10.0: remember which card had focus before a modal/player opened so
  // closing it returns the user to the exact same spot instead of dumping
  // focus on the Home pill or the first card in the DOM.
  const lastFocusedBeforeOverlayRef = useRef(null);
  const prevTabRef = useRef('home');

  const rememberFocus = useCallback(() => {
    try {
      const el = document.activeElement;
      if (el && el !== document.body && el.focus) {
        lastFocusedBeforeOverlayRef.current = el;
      }
    } catch {}
  }, []);

  const restoreFocus = useCallback(() => {
    const target = lastFocusedBeforeOverlayRef.current;
    lastFocusedBeforeOverlayRef.current = null;
    setTimeout(() => {
      const el = target && document.contains(target) ? target : null;
      if (el) {
        try { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; } catch {}
      }
      const fallback = document.querySelector('.tv-card, .tv-nav-pill.active, .tv-hero');
      if (fallback) { try { fallback.focus(); } catch {} }
    }, 60);
  }, []);

  // Load all catalogs on startup
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bolly, holly, serials, sports, trending, popMovies, popTv, newReleases] = await Promise.allSettled([
        getBollywoodCatalog(),
        getHollywoodCatalog(),
        getSerialsCatalog(),
        getLiveSportsEvents(),
        getTmdbTrending('all', 'week'),
        getTmdbCatalog('movie', 'popular'),
        getTmdbCatalog('tv', 'popular'),
        getTmdbNowPlaying(20)
      ]);

      if (bolly.status === 'fulfilled') setBollywoodItems(bolly.value || []);
      if (holly.status === 'fulfilled') setHollywoodItems(holly.value || []);
      if (serials.status === 'fulfilled') setSeriesItems(serials.value || []);
      if (sports.status === 'fulfilled') setSportsItems(sports.value || []);
      if (newReleases.status === 'fulfilled') setNowPlaying(newReleases.value || []);
      if (trending.status === 'fulfilled') setTmdbTrending(trending.value || []);
      if (popMovies.status === 'fulfilled') setTmdbMovies(popMovies.value || []);
      if (popTv.status === 'fulfilled') setTmdbSeries(popTv.value || []);
      // Addon catalogs (only loads when addons are installed — no-op otherwise)
      getAddonCatalogs().then(cats => {
        const items = cats.flatMap(c => c.items);
        setAddonCatalogItems(items.slice(0, 30));
      }).catch(() => {});
      // "Because you watched" personalization from watch history
      getBecauseYouWatched(getWatchHistory() || []).then(recs => {
        setBecauseYouWatched(recs || []);
      }).catch(() => {});
      setContinueWatching(getWatchHistory() || []);
    } catch (err) {
      console.error('Error loading catalogs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // v3.11.1: native player finished — clear the routing flag so the next
  // REMOTE_COMMAND targets the WebView player again.
  useEffect(() => {
    const clearNative = () => { setNativePlaybackActive(false); };
    window.addEventListener('ajo-native-player-closed', clearNative);
    return () => window.removeEventListener('ajo-native-player-closed', clearNative);
  }, []);

  // v3.11.0 PERF: IPTV (16 playlists) no longer blocks startup. Kick it off
  // 1.2s after first paint so the Home tab renders instantly on low-RAM Fire
  // TV sticks; the Live TV tab forces an immediate load when opened.
  const loadLiveTV = useCallback(async () => {
    try {
      const items = await getLiveBroadcasts();
      setLiveItems(items || []);
    } catch (e) {
      console.error('Error loading live TV:', e);
    } finally {
      setLiveLoaded(true);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { if (!liveLoaded) loadLiveTV(); }, 1200);
    return () => clearTimeout(t);
  }, [liveLoaded, loadLiveTV]);
  // User opened the Live TV tab before the lazy tick fired — load immediately.
  useEffect(() => {
    if (activeTab === 'live' && !liveLoaded) loadLiveTV();
  }, [activeTab, liveLoaded, loadLiveTV]);

  useEffect(() => {
    loadData();
    // Check for updates in background, then re-check every 4h + on app resume
    const runUpdateCheck = () => {
      checkForAppUpdates('tv').then((res) => {
        if (res && res.hasUpdate && !downloadProgress) {
          // v3.8.0 keystore cutover: a debug-signed install cannot update in
          // place to a release-signed APK. Route it to the guided one-time
          // reinstall flow instead of letting Android reject it silently.
          if (res.targetSigning === 'release' && !res.isReleaseSigned) {
            res.needsReinstall = true;
          }
          setOtaPrompt(res);
        }
      }).catch(() => {});
    };
    runUpdateCheck();
    const updateInterval = setInterval(runUpdateCheck, 4 * 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') runUpdateCheck();
    });

    window.onAJOUpdateProgress = (percent) => {
      setDownloadProgress({ percent });
    };
    window.onAJOUpdateStatus = (status) => {
      if (status === 'READY_TO_INSTALL') {
        setDownloadProgress({ percent: 100, ready: true });
      }
    };
    window.onAJOUpdateError = () => {
      setDownloadProgress(null);
    };
    return () => {
      clearInterval(updateInterval);
      document.removeEventListener('visibilitychange', runUpdateCheck);
    };
  }, [loadData]);


  // Handle item click (Live TV plays directly, Movies open details)
  const handleItemClick = useCallback((item) => {
    rememberFocus();
    if (item.is_live || item.type === 'live' || item.year === 'LIVE') {
      const allServers = Array.isArray(item.players) && item.players.length > 0
        ? item.players
        : Array.isArray(item.player) && item.player.length > 0
          ? item.player
          : (item.url ? [{ url: item.url, source: 'm3u8' }] : []);
      const server = allServers[0];
      const url = server?.url || item.url;

      // Fire TV / legacy Android TV: go straight to the native ExoPlayer activity with fallbacks
      if (url && shouldPreferNativePlayer()) {
        const title = item.title_en || item.title || item.name || 'Live Channel';
        if (playInNativePlayer(url, title, true, allServers)) return;
      }

      setActivePlayback({ item, server });
    } else {
      setSelectedItem(item);
    }
  }, [rememberFocus]);

  // Start playback from modal or details
  const handleStartPlayback = useCallback(async (item, server = null, episodes = [], episodeIndex = 0) => {
    rememberFocus();
    setSelectedItem(null);

    // AUTO-ID-RESOLUTION (unlock): if the item has a TMDB id but no IMDb id,
    // resolve it now so generateUniversalServers() builds the FULL mirror
    // queue. This is what makes every TMDB catalog title playable.
    let resolvedItem = item;
    try {
      const { enrichWithImdb } = await import('./api/tmdb');
      resolvedItem = await enrichWithImdb(item);
    } catch {}

    const episodeInfo = Array.isArray(episodes) && episodes[episodeIndex] ? episodes[episodeIndex] : null;
    let allServers = generateUniversalServers(resolvedItem, episodeInfo);
    // VPS health ranking: healthy mirrors first, dead ones last
    try {
      allServers = await getRankedServers(allServers);
    } catch {}
    // Stremio addon streams: append direct-playable URLs from installed addons
    try {
      const addonStreams = await getAddonStreams(resolvedItem);
      for (const s of addonStreams) {
        allServers.push({
          id: `addon-${s.addonName}-${allServers.length}`,
          name: `${s.name}${s.quality ? ' (' + s.quality + ')' : ''}`,
          url: s.url,
          source: s.source,
          quality: s.quality || 'Auto',
          provider: s.addonName
        });
      }
    } catch {}
    const selectedSrv = server || allServers[0];
    const url = selectedSrv?.url || item?.url;
    const isLiveItem = Boolean(item?.is_live || item?.type === 'live' || item?.year === 'LIVE');
    if (url && shouldPreferNativePlayer()) {
      const title = item?.title_en || item?.title || item?.name || 'Video Stream';
      if (playInNativePlayer(url, title, isLiveItem, allServers)) return;
    }

    setActivePlayback({ item: resolvedItem, server: selectedSrv, allServers, episodes, episodeIndex });
  }, [rememberFocus]);

  // Close player and save progress
  const handleClosePlayer = useCallback((lastTime, duration) => {
    if (activePlayback && lastTime > 10) {
      saveProgress(activePlayback.item, lastTime, duration);
      setContinueWatching(getWatchHistory() || []);
    }
    setActivePlayback(null);

    // Re-focus the card the user launched from (v3.10.0), falling back to
    // the old first-card behavior when the element is gone.
    restoreFocus();
  }, [activePlayback, restoreFocus]);

  // Global Remote Back Handler
  const handleBack = useCallback(() => {
    // v3.10.0 FIX: with the player's channels/servers/audio drawer open, Back
    // must close the drawer first — not kill playback and lose the resume
    // position. TVPlayer's own keydown handler performs the close.
    if (activePlayback && window.__ajoPlayerDrawerOpen) return;
    if (activePlayback) {
      handleClosePlayer(0, 0);
      return;
    }
    if (selectedItem) {
      setSelectedItem(null);
      restoreFocus();
      return;
    }
    if (activeTab === 'search') {
      // First Back in Search releases the input focus (for the on-screen
      // keyboard), second Back leaves the tab. Prevents accidental ejection.
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        try { ae.blur(); } catch {}
        return;
      }
    }
    if (activeTab !== 'home') {
      setActiveTab('home');
      return;
    }
  }, [activePlayback, selectedItem, activeTab, handleClosePlayer, restoreFocus]);

  // ---- CAST RECEIVER (bug fix): the TV app previously never listened for
  // cast messages, so the phone's "Play on TV" button did nothing. Handle
  // PLAY_MEDIA (play the exact item+server the phone sent), REMOTE_COMMAND
  // (play/pause/seek/back), NAV_TAB and UNPAIR.
  // v3.9.0 PERF: lazy-load castSync only when needed
  useEffect(() => {
    let unsubscribe = null;
    import('./api/castSync').then(({ castEngine, ensureTvRole }) => {
      // v3.11.1: ALWAYS run as the TV-side cast peer with a persisted room
      // code (regardless of UA/display-mode detection) or phones can never
      // pair — the engine drops every inbound message if the room/role is
      // wrong, and this used to fail silently on some Fire TV WebViews.
      const bootRoom = new URLSearchParams(window.location.search).get('room');
      ensureTvRole(bootRoom || undefined);
      unsubscribe = castEngine.subscribe((msg) => {
        try {
          if (msg.type === 'PLAY_MEDIA' && msg.item) {
            const castItem = msg.item;
            const servers = generateUniversalServers(castItem);
            const chosen = msg.server && msg.server.url ? msg.server : servers[0];
            const url = chosen?.url || castItem.url;
            if (!url) return;
            const title = castItem.title_en || castItem.title || castItem.name || 'Cast from Phone';
            const isLiveItem = Boolean(castItem.is_live || castItem.type === 'live' || castItem.year === 'LIVE');
            setSelectedItem(null);
            setActivePlayback(null);
            if (shouldPreferNativePlayer()) {
              if (playInNativePlayer(url, title, isLiveItem, servers)) return;
            }
            setActivePlayback({ item: castItem, server: chosen });
          } else if (msg.type === 'REMOTE_COMMAND') {
            const cmd = String(msg.command || '');
            // v3.11.1: when the native ExoPlayer owns playback, the WebView
            // <video> element isn't playing — route commands to the hardware
            // player through the Java bridge instead.
            if (isNativePlaybackActive()) {
              switch (cmd) {
                case 'PLAY': nativePlayerControl('PLAY'); break;
                case 'PAUSE': nativePlayerControl('PAUSE'); break;
                case 'PLAY_PAUSE': nativePlayerControl('PLAY_PAUSE'); break;
                case 'SEEK_FORWARD': nativePlayerControl('SEEK_FORWARD', 10); break;
                case 'SEEK_BACK': nativePlayerControl('SEEK_BACK', 10); break;
                case 'STOP': nativePlayerControl('STOP'); break;
                case 'BACK': nativePlayerControl('STOP'); break;
                default: break;
              }
              return;
            }
            const video = document.querySelector('video');
            switch (cmd) {
              case 'PLAY': if (video) video.play().catch(() => {}); break;
              case 'PAUSE': if (video) video.pause(); break;
              case 'PLAY_PAUSE':
                if (video) { video.paused ? video.play().catch(() => {}) : video.pause(); }
                break;
              case 'SEEK_FORWARD': if (video) video.currentTime = Math.min((video.currentTime || 0) + 10, video.duration || Infinity); break;
              case 'SEEK_BACK': if (video) video.currentTime = Math.max((video.currentTime || 0) - 10, 0); break;
              case 'BACK': handleBack(); break;
              default: break;
            }
          } else if (msg.type === 'NAV_TAB' && msg.tab) {
            setActiveTab(String(msg.tab));
          } else if (msg.type === 'WATCHLIST_SYNC' && Array.isArray(msg.items)) {
            import('./api/watchlistSync').then(({ mergeRemoteWatchlist }) => {
              const merged = mergeRemoteWatchlist(msg.items);
              setWatchlist(merged);
            }).catch(() => {});
          }
        } catch (err) {
          console.warn('[AJO-CAST] handler error:', err);
        }
      });
    }).catch(() => {});
    return () => { if (unsubscribe) unsubscribe(); };
  }, [handleBack]);

  // Spatial Navigation Hook
  const { focusInitial } = useSpatialNavigation({
    onBack: handleBack,
    isModalOpen: Boolean(selectedItem || activePlayback),
    modalSelector: selectedItem ? '.tv-modal-card' : activePlayback ? '.tv-player-fullscreen' : null,
  });

  // Focus initial element ONLY when the tab actually changed (v3.10.0).
  // Previously this fired whenever any modal/player closed too, yanking
  // focus away from the card being restored and onto the Home pill.
  useEffect(() => {
    if (prevTabRef.current === activeTab) return;
    prevTabRef.current = activeTab;
    if (!selectedItem && !activePlayback) {
      focusInitial('.tv-nav-pill.active, .tv-hero, .tv-card');
    }
  }, [activeTab, selectedItem, activePlayback, focusInitial]);

  // Featured Spotlight Hero Item (e.g. from Bollywood or Hollywood)
  const featuredItem = useMemo(() => {
    return bollywoodItems[0] || hollywoodItems[0] || null;
  }, [bollywoodItems, hollywoodItems]);

  // v3.9.0 PERF: removed YouTube trailer iframe from hero banner.
  // On Fire TV Stick 4K (1.5GB RAM) the iframe consumed ~150MB (Chromium
  // sub-renderer), competed for GPU with the WebView, and broke D-pad focus.

  // All Movies combined (upstream catalog + TMDB popular, strictly movies only)
  const allMovies = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const item of [...bollywoodItems, ...hollywoodItems, ...tmdbMovies]) {
      if (item.type === 'series' || item.type === 'serial' || item.category === 'serials' || item.category === 'Web Series') continue;
      const key = String(item.title_en || item.title || '').toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }, [bollywoodItems, hollywoodItems, tmdbMovies]);

  // Series: upstream + TMDB, strictly episodic/series only
  const allSeries = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const item of [...seriesItems, ...tmdbSeries]) {
      if (item.type === 'movie' && !item.episodes?.length) continue;
      const key = String(item.title_en || item.title || '').toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }, [seriesItems, tmdbSeries]);

  return (
    <div className="tv-app">
      {/* Top Google TV Style Navigation Bar */}
      <GoogleTVHeader activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* OTA Update Toast Banner */}
      {otaPrompt && (
        <div className="tv-ota-rail tv-rail" style={{
          background: otaPrompt.needsReinstall
            ? 'linear-gradient(90deg, #b45309, #f59e0b)'
            : 'linear-gradient(90deg, #2563eb, #38bdf8)',
          color: '#ffffff',
          padding: '10px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 700,
          fontSize: '0.95rem'
        }}>
          <span>
            {downloadProgress
              ? (downloadProgress.ready ? '⚡ Update downloaded! Launching installer...' : `📥 Downloading Update: ${downloadProgress.percent || 0}%`)
              : (otaPrompt.needsReinstall
                ? '⚠ AJO is switching to its permanent release key — this update needs a quick one-time reinstall.'
                : `🚀 New Update Available: v${otaPrompt.latestVersion} (Fire TV Edition)`)}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {!downloadProgress && (
              <button
                tabIndex={0}
                className="tv-btn-primary"
                style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                onClick={() => {
                  setDownloadProgress({ percent: 0 });
                  if (window.AndroidUpdater?.downloadAndInstall) {
                    window.AndroidUpdater.downloadAndInstall(otaPrompt.apkUrl);
                  } else {
                    window.open(otaPrompt.apkUrl, '_blank');
                  }
                }}
              >
                {otaPrompt.needsReinstall ? 'One-Time Reinstall' : 'Update Now'}
              </button>
            )}
            <button
              tabIndex={0}
              className="tv-btn-secondary"
              style={{ padding: '6px 16px', fontSize: '0.85rem' }}
              onClick={() => setOtaPrompt(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="tv-main-content">
        {loading ? (
          <div className="tv-center-state">
            <div className="tv-spinner" />
            <p style={{ fontWeight: 700, marginTop: 16 }}>Loading Catalog & Live Channels...</p>
          </div>
        ) : (
          <>
            {/* 🏠 HOME TAB */}
            {activeTab === 'home' && (
              <>
                {/* Spotlight Hero Banner */}
                {featuredItem && (
                  <div
                    tabIndex={0}
                    className="tv-hero"
                    style={{ backgroundImage: `url(${featuredItem.backdrop_url || featuredItem.poster_url})` }}
                    onClick={() => setSelectedItem(featuredItem)}
                  >

                    <div className="tv-hero-overlay" />
                    <div className="tv-hero-content">
                      <div className="tv-hero-badge">
                        <Sparkles size={12} />
                        <span>Featured Premiere</span>
                      </div>
                      <h1 className="tv-hero-title">{typeof featuredItem.title === 'string' ? featuredItem.title : (featuredItem.title_en || 'Featured Premiere')}</h1>
                      <p className="tv-hero-desc">{typeof featuredItem.description === 'string' ? featuredItem.description : ''}</p>
                      <button className="tv-hero-btn" tabIndex={0} onClick={() => setSelectedItem(featuredItem)}>
                        <Play size={16} fill="#07090e" />
                        <span>Watch Now</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Continue Watching Rail */}
                {continueWatching.length > 0 && (
                  <MediaRail
                    title="🕒 Continue Watching"
                    items={continueWatching}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Because You Watched (personalized from history) */}
                {becauseYouWatched.length > 0 && (
                  <MediaRail
                    title={`🎯 Because you watched ${becauseYouWatched[0]?.becauseOf || 'recent titles'}`}
                    items={becauseYouWatched}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Watchlist (synced with phone) */}
                {watchlist.length > 0 && (
                  <MediaRail
                    title="🔖 My Watchlist"
                    items={watchlist}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* TMDB Trending This Week (worldwide) */}
                {tmdbTrending.length > 0 && (
                  <MediaRail
                    title="🔥 Trending Worldwide This Week"
                    items={tmdbTrending}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* v3.11.0: Recently released movies (TMDB now_playing, India region) */}
                {nowPlaying.length > 0 && (
                  <MediaRail
                    title="🆕 Recently Released Movies (In Theatres Now)"
                    items={nowPlaying}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Stremio Addon catalogs rail (appears once an addon is installed) */}
                {addonCatalogItems.length > 0 && (
                  <MediaRail
                    title="🧩 From Your Addons"
                    items={addonCatalogItems}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Live Sports Rail */}
                {sportsItems.length > 0 && (
                  <MediaRail
                    title="🏆 Live Sports & Cricket Matches"
                    items={sportsItems}
                    isLive={true}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Live Channels Rail — priority-ordered; capped for DOM speed.
                    The full lineup lives in the Live TV tab. */}
                {liveItems.length > 0 && (
                  <MediaRail
                    title={`🔴 Live TV & News (${liveItems.length} channels)`}
                    items={liveItems.slice(0, 20)}
                    isLive={true}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Bollywood Movies Rail */}
                {bollywoodItems.length > 0 && (
                  <MediaRail
                    title="🎬 Bollywood Blockbusters"
                    items={bollywoodItems.slice(0, 20)}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Hollywood Movies Rail */}
                {hollywoodItems.length > 0 && (
                  <MediaRail
                    title="🍿 Hollywood Hits & 4K Cinema"
                    items={hollywoodItems.slice(0, 20)}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Web Series Rail */}
                {seriesItems.length > 0 && (
                  <MediaRail
                    title="📺 Binge-Worthy Web Series"
                    items={seriesItems.slice(0, 20)}
                    onSelectItem={handleItemClick}
                  />
                )}
              </>
            )}

            {/* 🏆 LIVE SPORTS TAB */}
            {activeTab === 'sports' && (
              <MediaGridView
                title="🏆 Live Sports Tournaments & Channels"
                items={sportsItems}
                isLive={true}
                onSelectItem={handleItemClick}
              />
            )}

            {/* 🎬 MOVIES TAB */}
            {activeTab === 'movies' && (
              <MediaGridView
                title="🎬 All Movies (Bollywood & Hollywood)"
                items={allMovies}
                onSelectItem={handleItemClick}
              />
            )}

            {/* 📺 WEB SERIES TAB */}
            {activeTab === 'series' && (
              <MediaGridView
                title="📺 Complete Web Series Vault"
                items={allSeries}
                onSelectItem={handleItemClick}
              />
            )}

            {/* 🔴 LIVE TV TAB */}
            {activeTab === 'live' && (
              <>
                {liveLoaded && liveItems.length === 0 ? (
                  <div className="tv-empty-state" style={{ textAlign: 'center', marginTop: 80 }}>
                    <p style={{ color: '#9aa3b2', fontSize: 19, marginBottom: 20 }}>
                      Couldn't load channels right now. Check your internet and try again.
                    </p>
                    <button
                      className="tv-retry-btn"
                      style={{
                        padding: '12px 34px', fontSize: 18, fontWeight: 700,
                        background: '#e50914', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer'
                      }}
                      onClick={() => { setLiveLoaded(false); loadLiveTV(); }}
                    >
                      ↻ Retry Loading Channels
                    </button>
                  </div>
                ) : (
                  <MediaGridView
                    title="🔴 Live Television Channels"
                    items={liveItems}
                    isLive={true}
                    onSelectItem={handleItemClick}
                  />
                )}
              </>
            )}

            {/* 🔍 SEARCH TAB */}
            {activeTab === 'search' && (
              <SearchView onSelectItem={handleItemClick} />
            )}

            {/* ⚙️ SETTINGS TAB */}
            {activeTab === 'settings' && (
              <SettingsView />
            )}
          </>
        )}
      </main>

      {/* Media Details Popup Modal */}
      {selectedItem && (
        <MediaDetailsModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStartPlayback={handleStartPlayback}
        />
      )}

      {/* Fullscreen TV Player */}
      {activePlayback && (
        <TVPlayer
          item={activePlayback.item}
          server={activePlayback.server}
          allServers={activePlayback.allServers}
          channels={liveItems}
          episodes={activePlayback.episodes}
          currentEpisodeIndex={activePlayback.episodeIndex}
          onSelectEpisode={(ep, idx) => handleStartPlayback(ep, null, activePlayback.episodes, idx)}
          onSelectChannel={(ch) => handleItemClick(ch)}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
}
