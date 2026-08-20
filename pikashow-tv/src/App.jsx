import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getBollywoodCatalog, 
  getHollywoodCatalog, 
  getSerialsCatalog, 
  getLiveBroadcasts 
} from './api/pikashow';
import { getWatchHistory, saveProgress } from './api/history';
import { checkForAppUpdates } from './api/otaUpdate';
import { GoogleTVHeader } from './components/GoogleTVHeader';
import { MediaRail } from './components/MediaRail';
import { MediaGridView } from './components/MediaGridView';
import { MediaDetailsModal } from './components/MediaDetailsModal';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { TVPlayer } from './components/TVPlayer';
import { useSpatialNavigation } from './hooks/useSpatialNavigation';
import { shouldPreferNativePlayer, playInNativePlayer } from './utils/nativePlayer';
import { Play, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [loading, setLoading] = useState(true);

  // Catalogs
  const [bollywoodItems, setBollywoodItems] = useState([]);
  const [hollywoodItems, setHollywoodItems] = useState([]);
  const [seriesItems, setSeriesItems] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);

  // Active Modals / Player
  const [selectedItem, setSelectedItem] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null); // { item, server, episodes, episodeIndex }
  const [otaPrompt, setOtaPrompt] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);

  // Load all catalogs on startup
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bolly, holly, serials, live] = await Promise.allSettled([
        getBollywoodCatalog(),
        getHollywoodCatalog(),
        getSerialsCatalog(),
        getLiveBroadcasts()
      ]);

      if (bolly.status === 'fulfilled') setBollywoodItems(bolly.value || []);
      if (holly.status === 'fulfilled') setHollywoodItems(holly.value || []);
      if (serials.status === 'fulfilled') setSeriesItems(serials.value || []);
      if (live.status === 'fulfilled') setLiveItems(live.value || []);
      setContinueWatching(getWatchHistory() || []);
    } catch (err) {
      console.error('Error loading catalogs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Check for updates in background
    checkForAppUpdates('tv').then((res) => {
      if (res && res.hasUpdate) {
        setOtaPrompt(res);
      }
    }).catch(() => {});

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
  }, [loadData]);

  // Handle item click (Live TV plays directly, Movies open details)
  const handleItemClick = useCallback((item) => {
    if (item.is_live || item.type === 'live' || item.year === 'LIVE') {
      const server = item.players?.[0] || item.player?.[0] || (item.url ? { url: item.url, source: 'm3u8' } : null);
      const url = server?.url || item.url;

      // Fire TV / legacy Android TV: go straight to the native ExoPlayer activity.
      // Mounting TVPlayer first would start a WebView MSE pipeline that renders
      // black and keeps decoding audio in the background behind the native player.
      if (url && shouldPreferNativePlayer()) {
        const title = item.title_en || item.title || item.name || 'Live Channel';
        if (playInNativePlayer(url, title, true)) return;
      }

      setActivePlayback({ item, server });
    } else {
      setSelectedItem(item);
    }
  }, []);

  // Start playback from modal or details
  const handleStartPlayback = useCallback((item, server = null, episodes = [], episodeIndex = 0) => {
    setSelectedItem(null);

    const url = server?.url || item?.url;
    const isLiveItem = Boolean(item?.is_live || item?.type === 'live' || item?.year === 'LIVE');
    if (url && shouldPreferNativePlayer()) {
      const title = item?.title_en || item?.title || item?.name || 'Video Stream';
      if (playInNativePlayer(url, title, isLiveItem)) return;
    }

    setActivePlayback({ item, server, episodes, episodeIndex });
  }, []);

  // Close player and save progress
  const handleClosePlayer = useCallback((lastTime, duration) => {
    if (activePlayback && lastTime > 10) {
      saveProgress(activePlayback.item, lastTime, duration);
      setContinueWatching(getWatchHistory() || []);
    }
    setActivePlayback(null);

    // Re-focus active cards smoothly
    setTimeout(() => {
      const target = document.querySelector('.tv-card, .tv-nav-pill.active, .tv-hero');
      if (target) {
        try { target.focus(); } catch (_) {}
      }
    }, 60);
  }, [activePlayback]);

  // Global Remote Back Handler
  const handleBack = useCallback(() => {
    if (activePlayback) {
      handleClosePlayer(0, 0);
      return;
    }
    if (selectedItem) {
      setSelectedItem(null);
      return;
    }
    if (activeTab !== 'home') {
      setActiveTab('home');
      return;
    }
  }, [activePlayback, selectedItem, activeTab, handleClosePlayer]);

  // Spatial Navigation Hook
  const { focusInitial } = useSpatialNavigation({
    onBack: handleBack,
    isModalOpen: Boolean(selectedItem || activePlayback),
    modalSelector: selectedItem ? '.tv-modal-card' : activePlayback ? '.tv-player-fullscreen' : null,
  });

  // Focus initial element when changing tabs
  useEffect(() => {
    if (!selectedItem && !activePlayback) {
      focusInitial('.tv-nav-pill.active, .tv-hero, .tv-card');
    }
  }, [activeTab, selectedItem, activePlayback, focusInitial]);

  // Featured Spotlight Hero Item (e.g. from Bollywood or Hollywood)
  const featuredItem = useMemo(() => {
    return bollywoodItems[0] || hollywoodItems[0] || null;
  }, [bollywoodItems, hollywoodItems]);

  // All Movies combined
  const allMovies = useMemo(() => {
    return [...bollywoodItems, ...hollywoodItems];
  }, [bollywoodItems, hollywoodItems]);

  return (
    <div className="tv-app">
      {/* Top Google TV Style Navigation Bar */}
      <GoogleTVHeader activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* OTA Update Toast Banner */}
      {otaPrompt && (
        <div style={{
          background: 'linear-gradient(90deg, #2563eb, #38bdf8)',
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
              : `🚀 New Update Available: v${otaPrompt.latestVersion} (Fire TV Edition)`}
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
                Update Now
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

                {/* Live Channels Rail */}
                {liveItems.length > 0 && (
                  <MediaRail
                    title="🔴 Live TV & News Broadcasts"
                    items={liveItems.slice(0, 20)}
                    isLive={true}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Bollywood Movies Rail */}
                {bollywoodItems.length > 0 && (
                  <MediaRail
                    title="🎬 Bollywood Blockbusters"
                    items={bollywoodItems}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Hollywood Movies Rail */}
                {hollywoodItems.length > 0 && (
                  <MediaRail
                    title="🍿 Hollywood Hits & 4K Cinema"
                    items={hollywoodItems}
                    onSelectItem={handleItemClick}
                  />
                )}

                {/* Web Series Rail */}
                {seriesItems.length > 0 && (
                  <MediaRail
                    title="📺 Binge-Worthy Web Series"
                    items={seriesItems}
                    onSelectItem={handleItemClick}
                  />
                )}
              </>
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
                items={seriesItems}
                onSelectItem={handleItemClick}
              />
            )}

            {/* 🔴 LIVE TV TAB */}
            {activeTab === 'live' && (
              <MediaGridView
                title="🔴 Live Television Channels"
                items={liveItems}
                isLive={true}
                onSelectItem={handleItemClick}
              />
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
