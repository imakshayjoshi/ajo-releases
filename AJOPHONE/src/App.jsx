import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  getBollywoodCatalog, 
  getHollywoodCatalog, 
  getSerialsCatalog, 
  getLiveBroadcasts,
  normalizeMediaItem
} from './api/pikashow';
import { getWatchHistory, getFavorites, saveProgress } from './api/history';
import { MobileHeader } from './components/MobileHeader';
import { MobileBottomNav } from './components/MobileBottomNav';
import { HeroBanner } from './components/HeroBanner';
import { MediaRail } from './components/MediaRail';
import { Top10Rail } from './components/Top10Rail';
import { MediaDetailsModal } from './components/MediaDetailsModal';
import { TVPlayer } from './components/TVPlayer';
import { SearchView } from './components/SearchView';
import { EPGGuideView } from './components/EPGGuideView';
import { SettingsView } from './components/SettingsView';
import { MediaGridView } from './components/MediaGridView';
import { AppProvidersRow } from './components/AppProvidersRow';
import { TVRemoteControlView } from './components/TVRemoteControlView';
import { getDocumentariesCatalog, getAnimeCatalog, getNetworkOriginalsCatalog } from './api/hubCatalog';
import { getShortTVSummaryList } from './api/shortTvCatalog';
import { ShortTVView } from './components/ShortTVView';
import { checkForAppUpdates, startAppUpdate } from './api/otaUpdate';
import { Film, Video, Tv, Radio, Bookmark, Cast, Rocket, X, ArrowUpCircle, Flame } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [ambientPoster, setAmbientPoster] = useState('');
  
  // OTA Update Startup Notice State
  const [otaNotice, setOtaNotice] = useState(null);
  const [isUpdatingOta, setIsUpdatingOta] = useState(false);
  const [otaProgress, setOtaProgress] = useState(0);

  useEffect(() => {
    // Check for updates silently on app startup
    const timer = setTimeout(() => {
      checkForAppUpdates('phone', false).then(info => {
        if (info && info.hasUpdate) {
          setOtaNotice(info);
        }
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
  
  // Catalogs & Favorites
  const [continueWatching, setContinueWatching] = useState([]);
  const [favoritesList, setFavoritesList] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
  const [sportsItems, setSportsItems] = useState([]);
  const [entertainmentItems, setEntertainmentItems] = useState([]);
  const [newsItems, setNewsItems] = useState([]);
  const [bollywoodItems, setBollywoodItems] = useState([]);
  const [hollywoodItems, setHollywoodItems] = useState([]);
  const [serialsItems, setSerialsItems] = useState([]);
  const [docuItems, setDocuItems] = useState([]);
  const [animeItems, setAnimeItems] = useState([]);
  const [networkItems, setNetworkItems] = useState([]);
  const [shortTvItems, setShortTvItems] = useState([]);
  const [featuredItem, setFeaturedItem] = useState(null);
  
  // Infinite Scroll Pagination State
  const [moviePage, setMoviePage] = useState(3);
  const [showPage, setShowPage] = useState(2);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);
  const [loadingMoreShows, setLoadingMoreShows] = useState(false);
  const [hasMoreMovies, setHasMoreMovies] = useState(true);
  const [hasMoreShows, setHasMoreShows] = useState(true);

  // Player & Details Modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null);

  // Reset scroll to top whenever switching tabs
  useEffect(() => {
    const scrollContainer = document.querySelector('.mobile-main-scroll-container');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  // Handle hardware Android back button
  useEffect(() => {
    const handlePopState = (e) => {
      if (activePlayback) {
        setActivePlayback(null);
        setContinueWatching(getWatchHistory());
      } else if (selectedItem) {
        setSelectedItem(null);
      } else if (activeTab !== 'home') {
        setActiveTab('home');
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'Backspace' && e.target === document.body) {
        handlePopState();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePlayback, selectedItem, activeTab]);

  const refreshFavorites = useCallback(() => {
    setFavoritesList(getFavorites());
  }, []);

  const loadAllContent = useCallback(async () => {
    try {
      setContinueWatching(getWatchHistory());
      refreshFavorites();

      const [live, bolly, holly, serials] = await Promise.allSettled([
        getLiveBroadcasts(),
        getBollywoodCatalog(6), // Pre-load Bollywood movies (120+ titles)
        getHollywoodCatalog(6), // Pre-load Hollywood movies (120+ titles)
        getSerialsCatalog(6)    // Pre-load Series (120+ titles)
      ]);

      const lList = live.status === 'fulfilled' && Array.isArray(live.value) ? live.value : [];
      const bList = bolly.status === 'fulfilled' && Array.isArray(bolly.value) ? bolly.value : [];
      const hList = holly.status === 'fulfilled' && Array.isArray(holly.value) ? holly.value : [];
      const sList = serials.status === 'fulfilled' && Array.isArray(serials.value) ? serials.value : [];

      setLiveItems(lList);
      
      // Categorize Live Channels
      const sports = lList.filter(c => 
        (c.category || '').toLowerCase().includes('sport') ||
        (c.title || '').toLowerCase().includes('sport') || 
        (c.title || '').toLowerCase().includes('cricket') || 
        (c.title || '').toLowerCase().includes('fancode') ||
        (c.title || '').toLowerCase().includes('ten') ||
        (c.title || '').toLowerCase().includes('willow')
      );

      const entertainment = lList.filter(c => 
        (c.category || '').toLowerCase().includes('entertainment') ||
        (c.category || '').toLowerCase().includes('general') ||
        (c.title || '').toLowerCase().includes('star') || 
        (c.title || '').toLowerCase().includes('sony') || 
        (c.title || '').toLowerCase().includes('zee') || 
        (c.title || '').toLowerCase().includes('colors')
      );

      const news = lList.filter(c => 
        (c.category || '').toLowerCase().includes('news') ||
        (c.title || '').toLowerCase().includes('news') ||
        (c.title || '').toLowerCase().includes('tak') ||
        (c.title || '').toLowerCase().includes('bharat')
      );

      setSportsItems(sports.length > 0 ? sports : lList.slice(0, 15));
      setEntertainmentItems(entertainment.length > 0 ? entertainment : lList.slice(0, 15));
      setNewsItems(news.length > 0 ? news : lList.slice(0, 15));

      setBollywoodItems(bList);
      setHollywoodItems(hList);
      setSerialsItems(sList);
      setDocuItems(getDocumentariesCatalog());
      setNetworkItems(getNetworkOriginalsCatalog());
      setShortTvItems(getShortTVSummaryList());
      
      const animeData = await getAnimeCatalog();
      setAnimeItems(animeData);

      // Featured Spotlight
      const spotlight = bList[0] || lList[0] || null;
      setFeaturedItem(spotlight);
      if (spotlight?.poster_url || spotlight?.poster) {
        setAmbientPoster(spotlight.poster_url || spotlight.poster);
      }
    } catch (err) {
      console.error('Error loading content:', err);
    }
  }, [refreshFavorites]);

  useEffect(() => {
    loadAllContent();
  }, [loadAllContent]);

  // Infinite Scroll Pagination Handlers (Direct TMDB 4K Catalog)
  const handleLoadMoreMovies = useCallback(async () => {
    if (loadingMoreMovies || !hasMoreMovies) return;
    setLoadingMoreMovies(true);
    try {
      const nextPage = moviePage + 1;
      const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=4e44d9029b1270a757cddc766a1bcb63&with_origin_country=IN&sort_by=popularity.desc&page=${nextPage}`);
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      const newItems = (data.results || []).map(m => {
        const title = m.title || m.original_title;
        const poster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '';
        const backdrop = m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : poster;
        return normalizeMediaItem({
          id: m.id,
          tmdb_id: m.id,
          title: title,
          title_en: title,
          poster_url: poster,
          backdrop_url: backdrop,
          type: 'movie',
          category: 'Bollywood',
          year: (m.release_date || '').substring(0, 4) || '2024',
          ratings: { mlab: { rating: m.vote_average ? m.vote_average.toFixed(1) : '8.6' } },
          description: m.overview || 'Bollywood blockbuster in 4K Ultra HD.',
          genres: [{ name: 'Bollywood 4K' }]
        }, 'bollywood');
      });
      
      if (newItems.length === 0 || nextPage >= (data.total_pages || 100)) {
        setHasMoreMovies(false);
      } else {
        setMoviePage(nextPage);
        setBollywoodItems(prev => {
          const seen = new Set(prev.map(i => (i.title || '').toLowerCase()));
          const filtered = newItems.filter(i => !seen.has((i.title || '').toLowerCase()));
          return [...prev, ...filtered];
        });
      }
    } catch (e) {
      setHasMoreMovies(false);
    } finally {
      setLoadingMoreMovies(false);
    }
  }, [moviePage, loadingMoreMovies, hasMoreMovies]);

  const handleLoadMoreShows = useCallback(async () => {
    if (loadingMoreShows || !hasMoreShows) return;
    setLoadingMoreShows(true);
    try {
      const nextPage = showPage + 1;
      const res = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=4e44d9029b1270a757cddc766a1bcb63&with_original_language=hi&sort_by=popularity.desc&page=${nextPage}`);
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      const newItems = (data.results || []).map(m => {
        const title = m.name || m.original_name;
        const poster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '';
        const backdrop = m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : poster;
        return normalizeMediaItem({
          id: m.id,
          tmdb_id: m.id,
          title: title,
          title_en: title,
          poster_url: poster,
          backdrop_url: backdrop,
          type: 'serials',
          category: 'Web Series',
          year: (m.first_air_date || '').substring(0, 4) || '2024',
          ratings: { mlab: { rating: m.vote_average ? m.vote_average.toFixed(1) : '8.8' } },
          description: m.overview || 'Premium Web Series in Full HD with all seasons & episodes.',
          genres: [{ name: 'Web Series 4K' }]
        }, 'serials');
      });
      
      if (newItems.length === 0 || nextPage >= (data.total_pages || 100)) {
        setHasMoreShows(false);
      } else {
        setShowPage(nextPage);
        setSerialsItems(prev => {
          const seen = new Set(prev.map(i => (i.title || '').toLowerCase()));
          const filtered = newItems.filter(i => !seen.has((i.title || '').toLowerCase()));
          return [...prev, ...filtered];
        });
      }
    } catch (e) {
      setHasMoreShows(false);
    } finally {
      setLoadingMoreShows(false);
    }
  }, [showPage, loadingMoreShows, hasMoreShows]);

  const handleStartPlayback = useCallback((item, server) => {
    setSelectedItem(null);
    const chosenPlayer = server || item.players?.[0] || item.player?.[0] || { url: item.url, source: 'm3u8' };
    setActivePlayback({ item, server: chosenPlayer });
  }, []);

  const handleCardClick = useCallback((item) => {
    if (item.is_live || item.type === 'live' || item.year === 'LIVE') {
      handleStartPlayback(item, item.players?.[0] || item.player?.[0]);
    } else {
      setSelectedItem(item);
    }
  }, [handleStartPlayback]);

  const handleClosePlayer = useCallback(() => {
    setActivePlayback(null);
    setContinueWatching(getWatchHistory());
  }, []);

  // Zero-Duplication Slices for Home Feed
  const topPicksItems = useMemo(() => {
    return bollywoodItems.slice(0, 8);
  }, [bollywoodItems]);

  const remainingBollywoodItems = useMemo(() => {
    return bollywoodItems.slice(8);
  }, [bollywoodItems]);

  // Combined In-Memory Media for Instant Search
  const allPreloadedMedia = useMemo(() => {
    return [...bollywoodItems, ...hollywoodItems, ...serialsItems, ...liveItems];
  }, [bollywoodItems, hollywoodItems, serialsItems, liveItems]);

  return (
    <div className="mobile-root-layout">
      {/* Dynamic Ambient Background */}
      <div className="mobile-background">
        <div 
          className="mobile-background-art" 
          style={{ backgroundImage: ambientPoster ? `url(${ambientPoster})` : 'none' }}
        />
        <div className="mobile-background-overlay" />
      </div>

      {/* Top Header */}
      <MobileHeader
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />

      {/* Main Scrollable Vertical Feed */}
      <main className="mobile-main-scroll-container">
        {activeTab === 'search' ? (
          <SearchView 
            onSelectItem={handleCardClick}
            onFocusItem={() => {}}
            preloadedItems={allPreloadedMedia}
          />
        ) : activeTab === 'epg' ? (
          <EPGGuideView 
            channels={liveItems}
            onSelectChannel={(ch) => handleStartPlayback(ch, ch.players?.[0] || ch.player?.[0])}
          />
        ) : activeTab === 'remote' ? (
          <TVRemoteControlView 
            onTuneChannelLocally={(ch) => handleStartPlayback(ch, ch.players?.[0] || ch.player?.[0])}
          />
        ) : activeTab === 'settings' ? (
          <SettingsView 
            onClearHistory={() => setContinueWatching([])}
            onReloadApp={loadAllContent}
          />
        ) : activeTab === 'short_tv' ? (
          <ShortTVView 
            onPlayFullscreen={(item, server) => handleStartPlayback(item, server)}
          />
        ) : activeTab === 'movies' ? (
          <MediaGridView
            title="Movies & Documentaries (4K UHD)"
            icon={Film}
            type="movies"
            items={[...bollywoodItems, ...hollywoodItems, ...docuItems.filter(d => d.type === 'movie')]}
            onSelectItem={handleCardClick}
            onLoadMore={handleLoadMoreMovies}
            hasMore={hasMoreMovies}
            isLoadingMore={loadingMoreMovies}
          />
        ) : activeTab === 'shows' ? (
          <MediaGridView
            title="Web Series, Documentaries & Anime"
            icon={Tv}
            type="shows"
            items={[...serialsItems, ...docuItems, ...animeItems, ...networkItems, ...shortTvItems]}
            onSelectItem={handleCardClick}
            onLoadMore={handleLoadMoreShows}
            hasMore={hasMoreShows}
            isLoadingMore={loadingMoreShows}
          />
        ) : (
          <>
            {/* FEATURED SPOTLIGHT HERO */}
            {featuredItem && (
              <HeroBanner
                featuredItem={featuredItem}
                onPlay={(item) => handleStartPlayback(item, item.players?.[0] || item.player?.[0])}
                onSelectInfo={(item) => setSelectedItem(item)}
                onFavoritesChanged={refreshFavorites}
              />
            )}

            {/* 🔥 SHORT TV & DRAMA SHORTS (REELS MODE) */}
            {shortTvItems.length > 0 && (
              <MediaRail 
                title="🔥 ShortTV & Drama Shorts (Reels Mode)" 
                items={shortTvItems}
                landscape={false}
                onSelectItem={() => setActiveTab('short_tv')}
                onSeeAll={() => setActiveTab('short_tv')}
              />
            )}

            {/* CONTINUE WATCHING (Landscape) */}
            {continueWatching.length > 0 && (
              <MediaRail 
                title="▶ Continue Watching" 
                items={continueWatching}
                landscape={true}
                onSelectItem={handleCardClick}
              />
            )}

            {/* TOP 10 IN INDIA TODAY (Iconic Netflix Giant Rank Outlines) */}
            {topPicksItems.length > 0 && (
              <Top10Rail
                title="🔥 Top 10 in India Today"
                items={topPicksItems}
                onSelectItem={handleCardClick}
              />
            )}

            {/* ⭐ MY WATCHLIST */}
            {favoritesList.length > 0 && (
              <MediaRail 
                title="⭐ My Watchlist" 
                items={favoritesList}
                landscape={false}
                onSelectItem={handleCardClick}
              />
            )}

            {/* TOP PICKS FOR YOU */}
            {topPicksItems.length > 0 && (
              <MediaRail 
                title="🔥 Top Picks For You" 
                items={topPicksItems}
                landscape={false}
                onSelectItem={handleCardClick}
                onSeeAll={() => setActiveTab('movies')}
              />
            )}

            {/* POPULAR HUBS & NETWORKS */}
            <AppProvidersRow 
              onSelectApp={(appId) => {
                if (appId === 'hotstar' || appId === 'sonyliv' || appId === 'zee5') {
                  setActiveTab('epg');
                } else if (appId === 'netflix' || appId === 'hbomax' || appId === 'appletv' || appId === 'prime' || appId === 'documentaries' || appId === 'anime' || appId === 'discovery') {
                  setActiveTab('shows');
                } else {
                  setActiveTab('movies');
                }
              }}
            />

            {/* LIVE SPORTS & CRICKET */}
            {sportsItems.length > 0 && (
              <MediaRail 
                title="⚡ Live Sports & Cricket" 
                items={sportsItems}
                landscape={true}
                onSelectItem={handleCardClick}
                onSeeAll={() => setActiveTab('epg')}
              />
            )}

            {/* 🔴 LIVE ENTERTAINMENT CHANNELS */}
            {entertainmentItems.length > 0 && (
              <MediaRail 
                title="🔴 Live TV Channels" 
                items={entertainmentItems}
                landscape={true}
                onSelectItem={handleCardClick}
                onSeeAll={() => setActiveTab('epg')}
              />
            )}

            {/* 📰 24/7 LIVE NEWS */}
            {newsItems.length > 0 && (
              <MediaRail 
                title="📰 24/7 Live News" 
                items={newsItems}
                landscape={true}
                onSelectItem={handleCardClick}
              />
            )}



            {/* BOLLYWOOD BLOCKBUSTERS */}
            {remainingBollywoodItems.length > 0 && (
              <MediaRail 
                title="🎬 Bollywood Movies" 
                items={remainingBollywoodItems}
                landscape={false}
                onSelectItem={handleCardClick}
                onSeeAll={() => setActiveTab('movies')}
              />
            )}

            {/* HOLLYWOOD CINEMA */}
            {hollywoodItems.length > 0 && (
              <MediaRail 
                title="🍿 Hollywood Cinema" 
                items={hollywoodItems}
                landscape={false}
                onSelectItem={handleCardClick}
                onSeeAll={() => setActiveTab('movies')}
              />
            )}

            {/* WEB SERIES */}
            {serialsItems.length > 0 && (
              <MediaRail 
                title="📺 Web Series & Shows" 
                items={serialsItems}
                landscape={false}
                onSelectItem={handleCardClick}
                onSeeAll={() => setActiveTab('shows')}
              />
            )}

            {/* 👑 NETWORK ORIGINALS (HBO, Netflix, Apple TV+, Prime) */}
            {networkItems.length > 0 && (
              <MediaRail 
                title="👑 Premium Network Originals" 
                items={networkItems}
                landscape={false}
                onSelectItem={handleCardClick}
              />
            )}

            {/* 🌍 PREMIUM DOCUMENTARIES & TRUE CRIME */}
            {docuItems.length > 0 && (
              <MediaRail 
                title="🌍 Documentaries & True Crime" 
                items={docuItems}
                landscape={false}
                onSelectItem={handleCardClick}
              />
            )}

            {/* ⚔️ ANIME & ANIMATION VAULT */}
            {animeItems.length > 0 && (
              <MediaRail 
                title="⚔️ Anime Vault (4K Ultra HD)" 
                items={animeItems}
                landscape={false}
                onSelectItem={handleCardClick}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />

      {/* Details Bottom Sheet Modal */}
      {selectedItem && (
        <MediaDetailsModal
          item={selectedItem}
          onClose={() => {
            setSelectedItem(null);
            refreshFavorites();
          }}
          onStartPlayback={handleStartPlayback}
        />
      )}

      {/* Fullscreen Touch Player */}
      {activePlayback && (
        <TVPlayer
          item={activePlayback.item}
          server={activePlayback.server}
          channels={liveItems}
          onSelectChannel={(ch) => handleStartPlayback(ch, ch.players?.[0] || ch.player?.[0])}
          onClose={handleClosePlayer}
        />
      )}

      {/* Sleek Floating Startup App Update Notification */}
      {otaNotice && otaNotice.hasUpdate && (
        <div 
          className="ota-update-banner"
          style={{
            position: 'fixed',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: 'calc(100% - 28px)',
            maxWidth: '520px',
            background: 'rgba(10, 15, 29, 0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(56, 189, 248, 0.6)',
            borderRadius: '18px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85), 0 0 24px rgba(56, 189, 248, 0.3)',
            animation: 'slideDown 0.3s ease-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.4)'
            }}>
              <Rocket size={18} color="#06090e" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#fff' }}>
                  Update Available
                </span>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px', background: '#22c55e', color: '#06090e' }}>
                  v{otaNotice.latestVersion}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isUpdatingOta ? `Downloading APK: ${otaProgress}%` : `Tap Update Now to install new features & fixes`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => {
                if (isUpdatingOta) return;
                setIsUpdatingOta(true);
                startAppUpdate(
                  otaNotice.apkUrl,
                  (progress) => setOtaProgress(progress),
                  (status) => {
                    if (status === 'READY_TO_INSTALL' || status === 'BROWSER_DOWNLOAD_OPENED') {
                      setIsUpdatingOta(false);
                    }
                  },
                  () => setIsUpdatingOta(false)
                );
              }}
              style={{
                background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                color: '#06090e',
                border: 'none',
                borderRadius: '12px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(56, 189, 248, 0.4)'
              }}
            >
              {isUpdatingOta ? `${otaProgress}%` : 'Update Now'}
            </button>

            <button
              onClick={() => setOtaNotice(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
