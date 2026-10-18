import React, { useState, useEffect, useCallback } from 'react';
import { getProviderCatalog, getMajorProviders } from '../api/providerApi';
import { MediaCard } from './MediaCard';
import { ArrowLeft, Loader2, Film, Tv } from 'lucide-react';

export function ProviderCatalog({ provider, onSelectItem, onBack }) {
  const [mediaType, setMediaType] = useState('movie');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(async (type, pg) => {
    setLoading(true);
    try {
      const result = await getProviderCatalog(provider.id, type, pg);
      if (pg === 1) {
        setItems(result.items || []);
      } else {
        setItems(prev => [...prev, ...(result.items || [])]);
      }
      setTotalPages(result.totalPages || 0);
    } catch (err) {
      console.error('Provider catalog error:', err);
    } finally {
      setLoading(false);
    }
  }, [provider.id]);

  useEffect(() => {
    setItems([]);
    setPage(1);
    loadPage(mediaType, 1);
  }, [mediaType, provider.id, loadPage]);

  const handleLoadMore = () => {
    if (page < totalPages && !loading) {
      const next = page + 1;
      setPage(next);
      loadPage(mediaType, next);
    }
  };

  return (
    <div className="tv-provider-catalog">
      {/* Header with provider logo and back button */}
      <div className="tv-provider-catalog-header">
        <button
          tabIndex={0}
          className="tv-btn-secondary"
          onClick={onBack}
          style={{ padding: '8px 14px', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        {provider.logo && (
          <img
            src={provider.logo}
            alt={provider.name}
            className="tv-provider-catalog-logo"
            style={{ border: `2px solid ${provider.color || '#333'}` }}
          />
        )}

        <div>
          <h2 className="tv-provider-catalog-title" style={{ color: provider.color || '#fff' }}>
            {provider.name}
          </h2>
          <span className="tv-provider-catalog-count">
            {items.length} titles loaded
          </span>
        </div>
      </div>

      {/* Movie / TV Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          tabIndex={0}
          className={`tv-cat-btn ${mediaType === 'movie' ? 'active' : ''}`}
          onClick={() => setMediaType('movie')}
        >
          <Film size={14} style={{ marginRight: 6 }} />
          Movies
        </button>
        <button
          tabIndex={0}
          className={`tv-cat-btn ${mediaType === 'tv' ? 'active' : ''}`}
          onClick={() => setMediaType('tv')}
        >
          <Tv size={14} style={{ marginRight: 6 }} />
          TV Shows
        </button>
      </div>

      {/* Content Grid */}
      {loading && items.length === 0 ? (
        <div className="tv-center-state">
          <div className="tv-spinner" />
          <p style={{ fontWeight: 700 }}>Loading {provider.name} catalog...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="tv-center-state">
          <p style={{ color: '#8a8a9a', fontSize: 17 }}>
            No content found for {provider.name} in your region.
          </p>
        </div>
      ) : (
        <>
          <div className="tv-grid">
            {items.map((item, idx) => (
              <MediaCard
                key={item.id || idx}
                item={item}
                onClick={onSelectItem}
              />
            ))}
          </div>

          {/* Load More */}
          {page < totalPages && (
            <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
              <button
                tabIndex={0}
                className="tv-btn-primary"
                onClick={handleLoadMore}
                disabled={loading}
                style={{ opacity: loading ? 0.6 : 1 }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="tv-spinner" style={{ width: 16, height: 16, border: 'none', borderTopColor: 'transparent' }} />
                    Loading...
                  </>
                ) : (
                  `Load More (Page ${page + 1})`
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Horizontal row of streaming provider logos/chips.
 * Clicking one triggers onSelectProvider(provider).
 */
export function ProviderRow({ onSelectProvider, activeProviderId }) {
  const providers = getMajorProviders();

  return (
    <section className="tv-rail">
      <div className="tv-rail-header">
        <h2 className="tv-rail-title">
          📺 Browse by Streaming Service
        </h2>
      </div>
      <div className="tv-provider-row">
        {providers.map(provider => (
          <button
            key={provider.id}
            tabIndex={0}
            className={`tv-provider-chip ${activeProviderId === provider.id ? 'active' : ''}`}
            onClick={() => onSelectProvider(provider)}
            style={{
              borderColor: activeProviderId === provider.id ? provider.color : undefined,
            }}
          >
            <span
              className="tv-provider-chip-logo-wrap"
              style={{ background: provider.color || '#222' }}
            >
              <span className="tv-provider-chip-monogram">
                {(provider.name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <img
                src={provider.logo}
                alt=""
                aria-hidden="true"
                className="tv-provider-chip-logo"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </span>
            <span className="tv-provider-chip-name">{provider.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
