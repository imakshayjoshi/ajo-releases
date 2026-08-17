import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MediaCard } from './MediaCard';
import { LandscapeMediaCard } from './LandscapeMediaCard';
import { Film, Tv, Radio, Sparkles, Loader2 } from 'lucide-react';
import { WorldwideFilterBar } from './WorldwideFilterBar';

export function MediaGridView({ 
  title, 
  icon: Icon = Film, 
  items = [], 
  type = 'movies', // 'movies' | 'shows' | 'channels' | 'shorts'
  onSelectItem, 
  onFocusItem,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false
}) {
  const [filters, setFilters] = useState({
    region: 'all',
    language: 'all',
    genre: 'all',
    year: 'all',
    sort: 'popular'
  });

  const bottomObserverRef = useRef(null);

  const filteredItems = useMemo(() => {
    let result = items.filter(item => {
      if (!item) return false;

      const titleLower = (item.title_en || item.title || item.title_ru || item.name || '').toLowerCase();
      const catLower = (item.category || '').toLowerCase();
      const netLower = (item.network || '').toLowerCase();
      const genres = (item.genres || []).map(g => (g.name || '').toLowerCase()).join(' ');
      const desc = (item.description || '').toLowerCase();
      const itemCountry = (item.country || '').toLowerCase();
      const itemLang = (item.language || '').toLowerCase();
      const yearStr = String(item.year || '');

      // 1. Region Filter
      if (filters.region !== 'all') {
        const reg = filters.region;
        if (reg === 'india') {
          const isIndia = catLower.includes('bolly') || catLower.includes('south') || catLower.includes('hindi') || catLower.includes('marathi') || catLower.includes('tamil') || catLower.includes('telugu') || catLower.includes('punjabi') || itemCountry.includes('india') || desc.includes('india') || desc.includes('hindi');
          if (!isIndia) return false;
        } else if (reg === 'hollywood') {
          const isHolly = catLower.includes('holly') || itemCountry.includes('usa') || desc.includes('hollywood') || desc.includes('american') || desc.includes('english');
          if (!isHolly) return false;
        } else if (reg === 'korea') {
          const isKorea = catLower.includes('korea') || catLower.includes('kdrama') || itemCountry.includes('korea') || desc.includes('korea');
          if (!isKorea) return false;
        } else if (reg === 'japan') {
          const isJapan = catLower.includes('anime') || itemCountry.includes('japan') || netLower.includes('crunchyroll') || desc.includes('anime') || desc.includes('japan');
          if (!isJapan) return false;
        } else if (reg === 'uk') {
          const isUK = netLower.includes('bbc') || itemCountry.includes('uk') || desc.includes('british') || desc.includes('london');
          if (!isUK) return false;
        } else if (reg === 'china') {
          const isChina = itemCountry.includes('china') || desc.includes('china') || desc.includes('chinese');
          if (!isChina) return false;
        } else if (reg === 'nollywood') {
          const isNolly = catLower.includes('nolly') || itemCountry.includes('nigeria') || desc.includes('lagos') || desc.includes('nollywood');
          if (!isNolly) return false;
        } else if (reg === 'spain') {
          const isSpain = itemCountry.includes('spain') || desc.includes('spanish');
          if (!isSpain) return false;
        } else if (reg === 'france') {
          const isFrance = itemCountry.includes('france') || desc.includes('french');
          if (!isFrance) return false;
        } else if (reg === 'turkey') {
          const isTurkey = itemCountry.includes('turkey') || desc.includes('turkish');
          if (!isTurkey) return false;
        }
      }

      // 2. Language Filter
      if (filters.language !== 'all') {
        const lang = filters.language;
        const matchesLang = itemLang.includes(lang) || desc.includes(lang) || catLower.includes(lang) || titleLower.includes(lang);
        if (!matchesLang) return false;
      }

      // 3. Genre Filter
      if (filters.genre !== 'all') {
        const g = filters.genre;
        if (g === 'short_tv') {
          if (item.type !== 'short_tv' && !catLower.includes('short')) return false;
        } else if (g === 'documentary') {
          const isDoc = catLower.includes('docu') || desc.includes('investigat') || desc.includes('documentary');
          if (!isDoc) return false;
        } else if (g === 'anime') {
          const isAnime = catLower.includes('anime') || desc.includes('anime') || netLower.includes('crunchyroll');
          if (!isAnime) return false;
        } else {
          const matchesGenre = genres.includes(g) || catLower.includes(g) || desc.includes(g);
          if (!matchesGenre) return false;
        }
      }

      // 4. Release Year Filter
      if (filters.year !== 'all') {
        const y = filters.year;
        if (y === '2026') {
          if (yearStr !== '2026') return false;
        } else if (y === '2025') {
          if (yearStr !== '2025') return false;
        } else if (y === '2024') {
          if (yearStr !== '2024') return false;
        } else if (y === '2023') {
          if (yearStr !== '2023') return false;
        } else if (y === '2022') {
          if (yearStr !== '2022') return false;
        } else if (y === '2021') {
          if (yearStr !== '2021') return false;
        } else if (y === '2020s') {
          const numYear = parseInt(yearStr, 10);
          if (isNaN(numYear) || numYear < 2020) return false;
        } else if (y === '2010s') {
          const numYear = parseInt(yearStr, 10);
          if (isNaN(numYear) || numYear < 2010 || numYear > 2019) return false;
        } else if (y === 'classic') {
          const numYear = parseInt(yearStr, 10);
          if (isNaN(numYear) || numYear >= 2010) return false;
        }
      }

      return true;
    });

    // 5. Sort Filter
    if (filters.sort === 'top_rated') {
      result = [...result].sort((a, b) => {
        const ra = Number(a.ratings?.mlab?.rating || a.ratings?.imdb?.rating || a.rating || 0);
        const rb = Number(b.ratings?.mlab?.rating || b.ratings?.imdb?.rating || b.rating || 0);
        return rb - ra;
      });
    } else if (filters.sort === 'newest') {
      result = [...result].sort((a, b) => {
        const ya = parseInt(String(a.year || '0'), 10);
        const yb = parseInt(String(b.year || '0'), 10);
        return yb - ya;
      });
    }

    return result;
  }, [items, filters]);

  // Infinite Scroll Trigger
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    );

    const target = bottomObserverRef.current;
    if (target) observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
    };
  }, [onLoadMore, hasMore, isLoadingMore]);

  const isChannels = type === 'channels';

  return (
    <div className="mobile-grid-container" style={{ position: 'relative', zIndex: 20, padding: '14px 14px 90px 14px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Page Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
        padding: '0 2px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.5)'
          }}>
            <Icon size={18} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.4px', margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {title}
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '3px 8px', borderRadius: '12px' }}>
            {filteredItems.length} Titles
          </span>
        </div>
      </div>

      {/* Worldwide Multi-Dimensional Filter Bar */}
      <WorldwideFilterBar
        filters={filters}
        onFilterChange={setFilters}
        totalResults={filteredItems.length}
      />

      {/* Grid Layout */}
      <div 
        className={isChannels ? "mobile-landscape-grid" : "mobile-portrait-grid"}
        style={{
          position: 'relative',
          zIndex: 20,
          display: 'grid',
          gridTemplateColumns: isChannels ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: '12px',
          width: '100%'
        }}
      >
        {filteredItems.map((item, idx) => {
          const key = item.id || item.kinopoisk_id || `${item.title}-${idx}`;
          return isChannels ? (
            <LandscapeMediaCard
              key={key}
              item={item}
              onClick={onSelectItem}
            />
          ) : (
            <MediaCard
              key={key}
              item={item}
              onClick={onSelectItem}
            />
          );
        })}
      </div>

      {/* Infinite Scroll Anchor & Loader */}
      {hasMore && (
        <div ref={bottomObserverRef} style={{ position: 'relative', zIndex: 20, padding: '24px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isLoadingMore ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 800, fontSize: '13px' }}>
              <Loader2 size={20} className="spin-animation" />
              <span>Loading more titles...</span>
            </div>
          ) : (
            <button 
              onClick={onLoadMore}
              style={{
                padding: '10px 22px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Load More
            </button>
          )}
        </div>
      )}
    </div>
  );
}
