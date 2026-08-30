import React, { useState } from 'react';
import { 
  SlidersHorizontal, 
  Globe2, 
  Languages, 
  Clapperboard, 
  Calendar, 
  ArrowUpDown, 
  X, 
  Check, 
  RotateCcw,
  Sparkles
} from 'lucide-react';

export const WORLDWIDE_REGIONS = [
  { id: 'all', label: 'All Regions', flag: '🌐' },
  { id: 'india', label: 'India (Bollywood/South)', flag: '🇮🇳' },
  { id: 'hollywood', label: 'Hollywood (USA)', flag: '🇺🇸' },
  { id: 'korea', label: 'Korea (K-Drama)', flag: '🇰🇷' },
  { id: 'japan', label: 'Japan (Anime)', flag: '🇯🇵' },
  { id: 'uk', label: 'United Kingdom', flag: '🇬🇧' },
  { id: 'china', label: 'China (C-Drama)', flag: '🇨🇳' },
  { id: 'nollywood', label: 'Nollywood (Africa)', flag: '🇳🇬' },
  { id: 'spain', label: 'Spain & Latin', flag: '🇪🇸' },
  { id: 'france', label: 'France', flag: '🇫🇷' },
  { id: 'turkey', label: 'Turkey', flag: '🇹🇷' }
];

export const WORLDWIDE_LANGUAGES = [
  { id: 'all', label: 'All Languages' },
  { id: 'hindi', label: 'Hindi (हिन्दी)' },
  { id: 'english', label: 'English' },
  { id: 'tamil', label: 'Tamil (தமிழ்)' },
  { id: 'telugu', label: 'Telugu (తెలుగు)' },
  { id: 'malayalam', label: 'Malayalam (മലയാളം)' },
  { id: 'kannada', label: 'Kannada (ಕನ್ನಡ)' },
  { id: 'punjabi', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { id: 'bengali', label: 'Bengali (বাংলা)' },
  { id: 'marathi', label: 'Marathi (मराठी)' },
  { id: 'korean', label: 'Korean (한국어)' },
  { id: 'japanese', label: 'Japanese (日本語)' },
  { id: 'spanish', label: 'Spanish (Español)' },
  { id: 'french', label: 'French (Français)' },
  { id: 'chinese', label: 'Chinese (中文)' },
  { id: 'turkish', label: 'Turkish (Türkçe)' }
];

export const WORLDWIDE_GENRES = [
  { id: 'all', label: 'All Genres' },
  { id: 'action', label: 'Action' },
  { id: 'thriller', label: 'Thriller & Suspense' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'romance', label: 'Romance' },
  { id: 'drama', label: 'Drama' },
  { id: 'crime', label: 'Crime & Gangster' },
  { id: 'sci-fi', label: 'Sci-Fi & Fantasy' },
  { id: 'horror', label: 'Horror' },
  { id: 'anime', label: 'Anime & Animation' },
  { id: 'documentary', label: 'Documentary & True Story' },
  { id: 'short_tv', label: 'ShortTV Drama Shorts' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'war', label: 'War & Military' }
];

export const WORLDWIDE_YEARS = [
  { id: 'all', label: 'All Years' },
  { id: '2026', label: '2026 (Latest)' },
  { id: '2025', label: '2025' },
  { id: '2024', label: '2024' },
  { id: '2023', label: '2023' },
  { id: '2022', label: '2022' },
  { id: '2021', label: '2021' },
  { id: '2020s', label: '2020s Decade' },
  { id: '2010s', label: '2010s Era' },
  { id: 'classic', label: 'Classics & Golden Era' }
];

export const SORT_OPTIONS = [
  { id: 'popular', label: 'Most Popular' },
  { id: 'top_rated', label: 'Top Rated (IMDb 8.0+)' },
  { id: 'newest', label: 'Newest Releases' }
];

export function WorldwideFilterBar({ filters, onFilterChange, totalResults = null }) {
  const [modalOpen, setModalOpen] = useState(false);

  const activeRegion = filters.region || 'all';
  const activeLanguage = filters.language || 'all';
  const activeGenre = filters.genre || 'all';
  const activeYear = filters.year || 'all';
  const activeSort = filters.sort || 'popular';

  // Count active non-default filters
  const activeFilterCount = [
    activeRegion !== 'all',
    activeLanguage !== 'all',
    activeGenre !== 'all',
    activeYear !== 'all',
    activeSort !== 'popular'
  ].filter(Boolean).length;

  const handleReset = () => {
    onFilterChange({
      region: 'all',
      language: 'all',
      genre: 'all',
      year: 'all',
      sort: 'popular'
    });
  };

  return (
    <div className="worldwide-filter-container" style={{ margin: '0 0 16px 0', width: '100%' }}>
      {/* Top Quick Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
        padding: '4px 2px',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        {/* Full Filter Modal Trigger Button */}
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '20px',
            background: activeFilterCount > 0 
              ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' 
              : 'rgba(255, 255, 255, 0.08)',
            border: activeFilterCount > 0 ? '1px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            boxShadow: activeFilterCount > 0 ? '0 4px 12px rgba(59, 130, 246, 0.4)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <SlidersHorizontal size={14} color={activeFilterCount > 0 ? '#ffffff' : '#38bdf8'} />
          <span>Worldwide Filters</span>
          {activeFilterCount > 0 && (
            <span style={{
              background: '#ffffff',
              color: '#1e3a8a',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              fontSize: '10px',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '2px'
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Quick Region Pills */}
        {WORLDWIDE_REGIONS.slice(0, 6).map(r => {
          const isSelected = activeRegion === r.id;
          return (
            <button
              key={r.id}
              onClick={() => onFilterChange({ ...filters, region: r.id })}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                color: isSelected ? '#38bdf8' : '#94a3b8',
                fontSize: '12px',
                fontWeight: isSelected ? 800 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span>{r.flag}</span>
              <span>{r.label.split(' ')[0]}</span>
            </button>
          );
        })}

        {/* Active Filter Clear Tag */}
        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            style={{
              padding: '6px 10px',
              borderRadius: '20px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Full Screen / Bottom Sheet Filters Modal */}
      {modalOpen && (
        <div 
          className="worldwide-filter-modal-backdrop"
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <div
            className="worldwide-filter-modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #111827 0%, #0b0f19 100%)',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={20} color="#38bdf8" />
                <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#fff', margin: 0 }}>
                  Worldwide Content Filter
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Filter Categories */}
            <div style={{
              padding: '16px 20px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}>
              {/* 1. Region / Country */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Globe2 size={15} color="#38bdf8" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0' }}>Region & Country</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {WORLDWIDE_REGIONS.map(r => {
                    const sel = activeRegion === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => onFilterChange({ ...filters, region: r.id })}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          background: sel ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: sel ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: sel ? '#38bdf8' : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: sel ? 800 : 600,
                          cursor: 'pointer'
                        }}
                      >
                        {r.flag} {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Language */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Languages size={15} color="#a855f7" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0' }}>Audio Language</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {WORLDWIDE_LANGUAGES.map(l => {
                    const sel = activeLanguage === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => onFilterChange({ ...filters, language: l.id })}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          background: sel ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: sel ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: sel ? '#c084fc' : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: sel ? 800 : 600,
                          cursor: 'pointer'
                        }}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Genre */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Clapperboard size={15} color="#f59e0b" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0' }}>Genre</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {WORLDWIDE_GENRES.map(g => {
                    const sel = activeGenre === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => onFilterChange({ ...filters, genre: g.id })}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          background: sel ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: sel ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: sel ? '#fbbf24' : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: sel ? 800 : 600,
                          cursor: 'pointer'
                        }}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Release Year */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Calendar size={15} color="#10b981" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0' }}>Release Year</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {WORLDWIDE_YEARS.map(y => {
                    const sel = activeYear === y.id;
                    return (
                      <button
                        key={y.id}
                        onClick={() => onFilterChange({ ...filters, year: y.id })}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          background: sel ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: sel ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: sel ? '#34d399' : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: sel ? 800 : 600,
                          cursor: 'pointer'
                        }}
                      >
                        {y.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Sort By */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <ArrowUpDown size={15} color="#ec4899" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0' }}>Sort By</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {SORT_OPTIONS.map(s => {
                    const sel = activeSort === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => onFilterChange({ ...filters, sort: s.id })}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          background: sel ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: sel ? '1px solid #ec4899' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: sel ? '#f472b6' : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: sel ? 800 : 600,
                          cursor: 'pointer'
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#090d16'
            }}>
              <button
                onClick={handleReset}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RotateCcw size={14} />
                <span>Reset Filters</span>
              </button>

              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
                }}
              >
                Apply Filters {totalResults !== null ? `(${totalResults})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
