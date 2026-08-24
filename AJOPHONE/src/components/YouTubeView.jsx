import React, { useState, useMemo } from 'react';
import { 
  YOUTUBE_CATEGORIES, 
  getYouTubeCatalog, 
  searchYouTubeVideos,
  getAdFreeYouTubeEmbedUrl,
  normalizeYouTubeItem 
} from '../api/youtube';
import { 
  Play, 
  Search, 
  Flame, 
  Film, 
  Trophy, 
  Music, 
  Radio, 
  Mic, 
  Gamepad2,
  Sparkles,
  CheckCircle2,
  Clock
} from 'lucide-react';

const YoutubeIcon = ({ size = 24, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" fill="#ff0000" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#fff" />
  </svg>
);

export function YouTubeView({ onPlayMedia, onFocusItem }) {
  const allItems = useMemo(() => getYouTubeCatalog(), []);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [customYtInput, setCustomYtInput] = useState('');

  const filteredItems = useMemo(() => {
    if (searchResults) return searchResults;
    if (selectedCategory === 'all') return allItems;
    if (selectedCategory === 'movies') return allItems.filter(i => i.category.includes('Movies'));
    if (selectedCategory === 'sports') return allItems.filter(i => i.category.includes('Sports') || i.category.includes('Cricket'));
    if (selectedCategory === 'music') return allItems.filter(i => i.category.includes('Music'));
    if (selectedCategory === 'podcasts') return allItems.filter(i => i.category.includes('Podcasts'));
    if (selectedCategory === 'news') return allItems.filter(i => i.category.includes('News') || i.is_live);
    if (selectedCategory === 'gaming') return allItems.filter(i => i.category.includes('Gaming'));
    return allItems;
  }, [allItems, selectedCategory, searchResults]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    const res = await searchYouTubeVideos(searchQuery);
    setSearchResults(res);
    setIsSearching(false);
  };

  return (
    <div className="gtv-main-scroll-container" style={{ padding: '24px 20px 100px 20px' }}>
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '20px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.6)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: '#ff0000',
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(255, 0, 0, 0.5)'
          }}>
            <YoutubeIcon size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
                YouTube Premium
              </h1>
              <span className="hero-badge" style={{ background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 800 }}>
                ⚡ AD-FREE
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Zero pre-roll ads, free full movies & highlights
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Search ad-free YouTube..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="gtv-search-input"
            style={{ flex: 1, padding: '10px 14px', fontSize: '13px', borderRadius: '12px' }}
          />
          <button
            type="submit"
            className="tv-btn tv-btn-primary"
            style={{ background: '#ef4444', color: '#fff', fontWeight: 800, padding: '10px 16px' }}
          >
            <Search size={16} />
          </button>
        </form>
      </div>

      {/* Category Navigation Pills */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', paddingBottom: '12px', marginBottom: '16px' }}>
        {YOUTUBE_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`tab-pill ${selectedCategory === cat.id && !searchResults ? 'tab-pill-active' : ''}`}
            onClick={() => {
              setSelectedCategory(cat.id);
              setSearchResults(null);
              setSearchQuery('');
            }}
            style={{
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '12px',
              whiteSpace: 'nowrap',
              borderColor: selectedCategory === cat.id ? '#ef4444' : undefined,
              background: selectedCategory === cat.id ? 'rgba(239, 68, 68, 0.2)' : undefined
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Video Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {filteredItems.map((item, idx) => (
          <div
            key={item.id || idx}
            className="media-card"
            onClick={() => onPlayMedia(item)}
            style={{
              borderRadius: '16px',
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer'
            }}
          >
            {/* 16:9 Thumbnail */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}>
              <img
                src={item.poster || item.poster_url}
                alt={item.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                loading="lazy"
                referrerPolicy="no-referrer"
              />

              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(to top, rgba(10, 14, 23, 0.9) 0%, transparent 60%)'
              }} />

              {/* Duration */}
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                background: item.is_live ? '#ef4444' : 'rgba(0, 0, 0, 0.85)',
                color: '#fff',
                padding: '3px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}>
                {item.is_live ? <Radio size={10} className="animate-pulse" /> : <Clock size={10} />}
                <span>{item.duration || item.year || 'HD'}</span>
              </div>

              {/* Play Icon */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Play size={18} fill="#fff" color="#fff" style={{ marginLeft: '2px' }} />
              </div>
            </div>

            {/* Video Details */}
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h3 style={{
                fontSize: '13px',
                fontWeight: 800,
                color: '#fff',
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {item.title}
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>{item.channel || 'YouTube'}</span>
                <CheckCircle2 size={11} color="#38bdf8" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
