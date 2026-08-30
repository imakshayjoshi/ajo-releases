import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Radio, 
  Star, 
  Search, 
  X, 
  Play,
  Clock,
  ChevronRight
} from 'lucide-react';
import { getCurrentAndNextProgram } from '../api/epg';
import { getIPTVChannels } from '../api/iptv';
import { toggleFavoriteChannel, isFavoriteChannel } from '../api/history';

export function EPGGuideView({ channels = [], onSelectChannel, onFocusItem }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchFilter, setSearchFilter] = useState('');
  const [channelData, setChannelData] = useState([]);
  const [favRefreshCount, setFavRefreshCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const clockRef = useRef(null);

  const categories = [
    '⭐ Favorites',
    'All', 
    'Sports', 
    'Entertainment',
    'Movies', 
    'News', 
    'Kids', 
    'Music', 
    'Documentary', 
    'Regional'
  ];

  // Update clock every 30 seconds to keep Now/Next fresh
  useEffect(() => {
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(clockRef.current);
  }, []);

  useEffect(() => {
    getIPTVChannels().then(chs => {
      const sourceList = chs && chs.length > 0 ? chs : (channels || []);
      const processed = sourceList.map((ch, idx) => {
        const epg = getCurrentAndNextProgram(ch);
        return {
          ...ch,
          channelNumber: 100 + idx + 1,
          epg: epg,
          is_fav: isFavoriteChannel(ch)
        };
      });
      setChannelData(processed);
    });
  }, [channels, favRefreshCount]);

  const handleToggleFav = (e, ch) => {
    e.stopPropagation();
    toggleFavoriteChannel(ch);
    setFavRefreshCount(prev => prev + 1);
  };

  const filteredChannels = useMemo(() => {
    return channelData.filter(ch => {
      const q = searchFilter.toLowerCase().trim();
      const matchesSearch = !q || 
        ch.title.toLowerCase().includes(q) || 
        (ch.category || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (selectedCategory === '⭐ Favorites') {
        return isFavoriteChannel(ch);
      }

      if (selectedCategory === 'All') return true;
      const cat = (ch.category || '').toLowerCase();
      const title = (ch.title || '').toLowerCase();
      const target = selectedCategory.toLowerCase();

      if (target === 'sports') return cat.includes('sport') || title.includes('sport') || title.includes('cricket') || title.includes('willow') || title.includes('ten') || title.includes('fancode');
      if (target === 'news') return cat.includes('news') || title.includes('news') || title.includes('tak') || title.includes('abp') || title.includes('republic') || title.includes('cnn');
      if (target === 'documentary') return cat.includes('docu') || title.includes('docu') || title.includes('discovery') || title.includes('nat geo') || title.includes('docubay');
      if (target === 'movies') return cat.includes('movie') || title.includes('cinema') || title.includes('max') || title.includes('film') || title.includes('goldmines');
      if (target === 'music') return cat.includes('music') || title.includes('music') || title.includes('9x') || title.includes('mtv') || title.includes('zing');
      if (target === 'kids') return cat.includes('kid') || cat.includes('anim') || title.includes('cartoon') || title.includes('disney') || title.includes('nick');
      if (target === 'regional') return cat.includes('regional') || title.includes('pravah') || title.includes('marathi') || title.includes('maa') || title.includes('sun');
      if (target === 'entertainment') return cat.includes('entertainment') || title.includes('star') || title.includes('sony') || title.includes('zee') || title.includes('colors');
      return true;
    });
  }, [channelData, selectedCategory, searchFilter, favRefreshCount]);

  const formatClock = (d) => {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="mobile-epg-container" style={{ position: 'relative', zIndex: 20, padding: '16px 24px 80px 24px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Radio size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.3px' }}>
              Live TV Guide
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
              {filteredChannels.length} channels · {formatClock(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '14px', padding: '10px 16px', marginBottom: '14px'
      }}>
        <Search size={16} color="#64748b" />
        <input
          type="text"
          placeholder="Search channels..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: '#ffffff', fontSize: '14px', fontWeight: 600
          }}
        />
        {searchFilter && (
          <button onClick={() => setSearchFilter('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '14px', scrollbarWidth: 'none' }}>
        {categories.map(cat => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              className="tv-focusable-card"
              data-focusable="true"
              tabIndex={0}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px',
                border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)',
                background: isSelected ? 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)' : 'rgba(15,23,42,0.85)',
                color: isSelected ? '#06090e' : '#ffffff', cursor: 'pointer', flexShrink: 0
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Channel List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {filteredChannels.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <Radio size={44} color="#64748b" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontWeight: 700, fontSize: '15px' }}>
              {selectedCategory === '⭐ Favorites'
                ? 'No favorite channels pinned yet. Tap ⭐ on any channel to add it!'
                : 'No channels found matching your filter.'}
            </p>
          </div>
        ) : (
          filteredChannels.map((ch, idx) => {
            const isFav = isFavoriteChannel(ch);
            const currentProg = ch.epg?.current;
            const nextProg = ch.epg?.next;
            const logo = ch.logo || ch.poster_url || ch.poster;
            const progress = currentProg?.progressPercent || 0;

            return (
              <div
                key={ch.id || ch.url || idx}
                className="channel-guide-row tv-card tv-focusable-card"
                data-focusable="true"
                tabIndex={0}
                onClick={() => onSelectChannel && onSelectChannel(ch)}
                onFocus={() => onFocusItem && onFocusItem(ch)}
                style={{
                  display: 'flex', flexDirection: 'column',
                  borderRadius: '16px', overflow: 'hidden',
                  background: 'rgba(17,24,39,0.92)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  cursor: 'pointer', width: '100%', boxSizing: 'border-box'
                }}
              >
                {/* Main Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px' }}>
                  {/* Logo */}
                  <div style={{
                    position: 'relative', width: '60px', height: '60px', borderRadius: '12px',
                    background: '#0a0e17', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)'
                  }}>
                    {logo ? (
                      <img
                        src={logo} alt={ch.title}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '5px' }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <Radio size={26} color="#38bdf8" />
                    )}
                    <span style={{
                      position: 'absolute', bottom: '2px', right: '2px', fontSize: '8px', fontWeight: 900,
                      background: 'rgba(0,0,0,0.85)', color: '#38bdf8', padding: '1px 4px', borderRadius: '3px'
                    }}>
                      #{ch.channelNumber}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{
                        fontSize: '15px', fontWeight: 800, color: '#ffffff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {ch.title}
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: 800, color: '#4ade80',
                        background: 'rgba(74,222,128,0.12)', padding: '2px 7px',
                        borderRadius: '20px', border: '1px solid rgba(74,222,128,0.3)', flexShrink: 0
                      }}>
                        ● LIVE
                      </span>
                    </div>

                    {/* Now Playing */}
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        NOW
                      </span>
                      <span style={{
                        fontSize: '12px', color: '#e2e8f0', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                      }}>
                        {currentProg?.title || 'Live Broadcast'}
                      </span>
                    </div>

                    {/* Next Program */}
                    {nextProg && (
                      <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          NEXT
                        </span>
                        <span style={{
                          fontSize: '11px', color: '#94a3b8', fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                        }}>
                          {nextProg.startTimeFormatted} · {nextProg.title}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={(e) => handleToggleFav(e, ch)}
                      style={{
                        background: isFav ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.07)',
                        border: isFav ? '1px solid #eab308' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '50%', width: '34px', height: '34px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isFav ? '#eab308' : '#94a3b8', cursor: 'pointer'
                      }}
                    >
                      <Star size={15} fill={isFav ? '#eab308' : 'none'} />
                    </button>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: '#ffffff', padding: '7px 14px', borderRadius: '20px',
                      fontSize: '12px', fontWeight: 900,
                      boxShadow: '0 4px 12px rgba(239,68,68,0.35)'
                    }}>
                      <Play size={12} fill="#fff" />
                      PLAY
                    </div>
                  </div>
                </div>

                {/* Progress Bar for Current Show */}
                {currentProg && progress > 0 && (
                  <div style={{ padding: '0 16px 10px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                        <Clock size={9} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                        {currentProg.startTimeFormatted} – {currentProg.endTimeFormatted}
                      </span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>
                        {progress}% aired
                      </span>
                    </div>
                    <div style={{
                      height: '3px', borderRadius: '2px',
                      background: 'rgba(255,255,255,0.1)', overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%', width: `${progress}%`,
                        background: 'linear-gradient(90deg, #ef4444, #f97316)',
                        borderRadius: '2px', transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

