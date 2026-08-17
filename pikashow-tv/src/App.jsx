import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getBollywoodCatalog, 
  getHollywoodCatalog, 
  getSerialsCatalog, 
  getLiveBroadcasts,
  normalizeMediaItem
} from './api/pikashow';
import { getWatchHistory, saveProgress } from './api/history';
import { getDocumentariesCatalog, getAnimeCatalog, getNetworkOriginalsCatalog } from './api/hubCatalog';
import { getShortTVSummaryList } from './api/shortTvCatalog';
import { checkForAppUpdates, startAppUpdate } from './api/otaUpdate';
import { useSpatialNavigation } from './hooks/useSpatialNavigation';
import { GoogleTVHeader } from './components/GoogleTVHeader';
import { HeroBanner } from './components/HeroBanner';
import { MediaRail } from './components/MediaRail';
import { Top10Rail } from './components/Top10Rail';
import { MediaDetailsModal } from './components/MediaDetailsModal';
import { TVPlayer } from './components/TVPlayer';
import { SearchView } from './components/SearchView';
import { EPGGuideView } from './components/EPGGuideView';
import { SettingsView } from './components/SettingsView';
import { MediaGridView } from './components/MediaGridView';
import { ShortTVView } from './components/ShortTVView';
import { Film, Video, Tv, Trophy, Radio, Flame, Rocket, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [ambientPoster, setAmbientPoster] = useState('');
  
  // OTA Update Startup Notice State
  const [otaNotice, setOtaNotice] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkForAppUpdates('tv', false).then(info => {
        if (info && info.hasUpdate) {
          setOtaNotice(info);
        }
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Catalogs
  const [continueWatching, setContinueWatching] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
  const [sportsItems, setSportsItems] = useState([]);
  const [entertainmentItems, setEntertainmentItems] = useState([]);
  const [newsItems, setNewsItems] = useState([]);
  const [musicItems, setMusicItems] = useState([]);
  const [bollywoodItems, setBollywoodItems] = useState([]);
  const [hollywoodItems, setHollywoodItems] = useState([]);
  const [serialsItems, setSerialsItems] = useState([]);
  const [docuItems, setDocuItems] = useState([]);
  const [animeItems, setAnimeItems] = useState([]);
  const [networkItems, setNetworkItems] = useState([]);
  const [shortTvItems, setShortTvItems] = useState([]);
  const [featuredItem, setFeaturedItem] = useState(null);
  const [loading, setLoading] = useState(true);

  // Player & Details Modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null);

  // 2D Spatial Navigation with Android TV Back Stack
  useSpatialNavigation({
    enabled: true,
    onBack: () => {
      if (activePlayback) {
        setActivePlayback(null);
        setContinueWatching(getWatchHistory());
      } else if (selectedItem) {
        setSelectedItem(null);
      } else if (activeTab !== 'home') {
        setActiveTab('home');
      }
    }
  });

  const loadAllContent = useCallback(async () => {
    setLoading(true);
    try {
      setContinueWatching(getWatchHistory());

      const [live, bolly, holly, serials] = await Promise.allSettled([
        getLiveBroadcasts(),
        getBollywoodCatalog(),
        getHollywoodCatalog(),
        getSerialsCatalog()
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

      const music = lList.filter(c => 
        (c.category || '').toLowerCase().includes('music') ||
        (c.title || '').toLowerCase().includes('9x') ||
        (c.title || '').toLowerCase().includes('mtv') ||
        (c.title || '').toLowerCase().includes('zoom')
      );

      setSportsItems(sports.length > 0 ? sports : lList.slice(0, 15));
      setEntertainmentItems(entertainment.length > 0 ? entertainment : lList.slice(0, 15));
      setNewsItems(news.length > 0 ? news : lList.slice(0, 15));
      setMusicItems(music.length > 0 ? music : lList.slice(0, 15));

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllContent();
  }, [loadAllContent]);

  // Click on a movie/show/channel card
  const handleCardClick = useCallback((item) => {
    if (item.is_live || item.type === 'live' || item.year === 'LIVE') {
      const server = item.players?.[0] || item.player?.[0] || (item.url ? { url: item.url, source: 'm3u8' } : null);
      setActivePlayback({ item, server });
    } else {
      setSelectedItem(item);
    }
  }, []);

  const handleStartPlayback = useCallback((item, server) => {
    setSelectedItem(null);
    setActivePlayback({ item, server });
  }, []);

  const handleClosePlayer = useCallback((lastTime, duration) => {
    if (activePlayback && lastTime > 10) {
      saveProgress(activePlayback.item, lastTime, duration);
      setContinueWatching(getWatchHistory());
    }
    setActivePlayback(null);
  }, [activePlayback]);

  const handleFocusItem = useCallback((item) => {
    const poster = item.backdrop_url || item.poster_url || item.poster || item.logo || '';
    if (poster) {
      setAmbientPoster(poster);
    }
  }, []);

  return (
    <div className="gtv-root-layout">
      {/* Dynamic Ambient Background Wallpaper */}
      <div 
        className="tv-background-art"
        style={{
          backgroundImage: ambientPoster ? `url(${ambientPoster})` : 'none',
          opacity: ambientPoster ? 0.35 : 0
        }}
      />
      <div className="tv-background-overlay" />

      {/* Google TV Top Header Navigation */}
      <GoogleTVHeader 
        activeTab={activeTab} 
        onTabChange={(tab) => setActiveTab(tab)}
      />

      {/* Main 10-Foot TV Content Area */}
      <main className="mobile-main-scroll-container">
        {activeTab === 'search' ? (
          <SearchView 
            onSelectItem={handleCardClick}
            onFocusItem={handleFocusItem}
          />
        ) : activeTab === 'epg' ? (
          <EPGGuideView 
            channels={liveItems}
            onSelectChannel={(ch) => handleStartPlayback(ch, ch.players?.[0] || ch.player?.[0])}
            onFocusItem={handleFocusItem}
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
            onFocusItem={handleFocusItem}
          />
        ) : activeTab === 'shows' ? (
          <MediaGridView
            title="Web Series, Documentaries & Anime"
            icon={Tv}
            type="shows"
            items={[...serialsItems, ...docuItems, ...animeItems, ...networkItems, ...shortTvItems]}
            onSelectItem={handleCardClick}
            onFocusItem={handleFocusItem}
          />
        ) : (
          <>
            {/* FOR YOU / HOME TAB VIEW */}
            {featuredItem && (
              <HeroBanner
                featuredItem={featuredItem}
                onPlay={(item) => handleStartPlayback(item, item.players?.[0] || item.player?.[0])}
                onSelectInfo={(item) => setSelectedItem(item)}
              />
            )}

            {/* CONTINUE WATCHING ROW */}
            {continueWatching.length > 0 && (
              <MediaRail 
                title="▶️ Continue Watching" 
                items={continueWatching}
                landscape={true}
                onSelectItem={handleCardClick}
                onFocusItem={handleFocusItem}
              />
            )}

            {/* TOP 10 IN INDIA TODAY */}
            {bollywoodItems.length > 0 && (
              <Top10Rail 
                title="🔥 Top 10 in India Today" 
                items={bollywoodItems.slice(0, 10)}
                onSelectItem={handleCardClick}
                onFocusItem={handleFocusItem}
              />
            )}

            {/* 🔥 SHORT TV & DRAMA SHORTS */}
            {shortTvItems.length > 0 && (
              <MediaRail 
                title="🔥 ShortTV & Drama Shorts (Reels Mode)" 
                items={shortTvItems}
                landscape={false}
                onSelectItem={() => setActiveTab('short_tv')}
                onFocusItem={handleFocusItem}
              />
            )}

            {/* LIVE SPORTS & CRICKET */}
            <MediaRail 
              title="⚡ Live Sports & Cricket (Star Sports, Sony Sports, Willow)" 
              items={sportsItems}
              landscape={true}
              onSelectItem={handleCardClick}
              onFocusItem={handleFocusItem}
            />

            {/* LIVE TV CHANNELS */}
            <MediaRail 
              title="🔴 Live Star, Sony & Zee TV Channels" 
              items={entertainmentItems}
              landscape={true}
              onSelectItem={handleCardClick}
              onFocusItem={handleFocusItem}
            />

            {/* LIVE NEWS */}
            <MediaRail 
              title="📰 24/7 Live News Channels" 
              items={newsItems}
              landscape={true}
              onSelectItem={handleCardClick}
              onFocusItem={handleFocusItem}
            />

            {/* BOLLYWOOD BLOCKBUSTERS */}
            <MediaRail 
              title="🎬 Bollywood Blockbusters (4K UHD)" 
              items={bollywoodItems}
              landscape={false}
              onSelectItem={handleCardClick}
              onFocusItem={handleFocusItem}
            />

            {/* HOLLYWOOD MOVIES */}
            <MediaRail 
              title="🍿 Hollywood Blockbusters" 
              items={hollywoodItems}
              landscape={false}
              onSelectItem={handleCardClick}
              onFocusItem={handleFocusItem}
            />

            {/* TV SERIALS */}
            <MediaRail 
              title="📺 Web Serials & Premium Series" 
              items={serialsItems}
              landscape={false}
              onSelectItem={handleCardClick}
              onFocusItem={handleFocusItem}
            />

            {/* 👑 NETWORK ORIGINALS */}
            {networkItems.length > 0 && (
              <MediaRail 
                title="👑 Premium Network Originals (HBO, Netflix, Prime)" 
                items={networkItems}
                landscape={false}
                onSelectItem={handleCardClick}
                onFocusItem={handleFocusItem}
              />
            )}

            {/* 🌍 DOCUMENTARIES */}
            {docuItems.length > 0 && (
              <MediaRail 
                title="🌍 Documentaries & True Crime" 
                items={docuItems}
                landscape={false}
                onSelectItem={handleCardClick}
                onFocusItem={handleFocusItem}
              />
            )}

            {/* ⚔️ ANIME VAULT */}
            {animeItems.length > 0 && (
              <MediaRail 
                title="⚔️ Anime Vault (4K Ultra HD)" 
                items={animeItems}
                landscape={false}
                onSelectItem={handleCardClick}
                onFocusItem={handleFocusItem}
              />
            )}
          </>
        )}
      </main>

      {/* Details Modal */}
      {selectedItem && (
        <MediaDetailsModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStartPlayback={handleStartPlayback}
        />
      )}

      {/* Fullscreen TV Player with In-Player EPG Quick Switcher */}
      {activePlayback && (
        <TVPlayer
          item={activePlayback.item}
          server={activePlayback.server}
          channels={liveItems}
          onSelectChannel={(ch) => handleStartPlayback(ch, ch.players?.[0] || ch.player?.[0])}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
}
