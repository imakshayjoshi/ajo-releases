import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAnalytics } from './api/analytics';
import { CURRENT_APP_VERSION } from './api/otaUpdate';

// v3.4.2: analytics was defined but never initialized on phone — app_boot
// events never fired and every event carried the hardcoded fallback version.
window.__ajoAnalyticsVersion = CURRENT_APP_VERSION;
initAnalytics();

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#06090e',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          padding: '40px',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '32px', marginBottom: '16px', color: '#f87171' }}>AJO Error</h1>
          <p style={{ color: '#94a3b8', maxWidth: '600px', marginBottom: '24px', lineHeight: '1.6' }}>
            {this.state.error?.message || "An unexpected rendering error occurred."}
          </p>
          <pre style={{ color: '#64748b', fontSize: 12, maxWidth: 600, overflow: 'auto', marginBottom: 24, textAlign: 'left' }}>
            {this.state.error?.stack?.split('\n').slice(0, 6).join('\n') || ''}
          </pre>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 28px',
                backgroundColor: '#00BB7F',
                color: '#06090e',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Reload App
            </button>
            <button
              onClick={() => {
                try { {
                // v3.12.59 FIX (ported): cache keys only — user data survives
                const CACHE_KEY_PATTERNS = [
                  /^ajo_iptv_cache_v\d+$/,
                  /^ajo_channels_manifest_v\d+$/,
                  /^ajo_sports_cache_v\d+$/,
                  /^ajo_catalog_v\d+$/,
                ];
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
                for (const key of keys) {
                  if (CACHE_KEY_PATTERNS.some((p) => p.test(key))) {
                    localStorage.removeItem(key);
                  }
                }
              } } catch {}
                try { sessionStorage.clear(); } catch {}
                window.location.reload();
              }}
              style={{
                padding: '12px 28px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#ef4444',
                borderRadius: '12px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Clear Cache & Reset
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
