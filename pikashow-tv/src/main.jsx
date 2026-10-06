import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './utils/nativePlayer'; // Force execution of side-effects to bind window.__ajoEmbedPreflightResult

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reloadBtnRef = React.createRef();
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught error:", error, errorInfo);
    // v3.12.59: analytics — crash capture (message + stack head).
    try {
      import('./api/analytics').then((m) => {
        m.track('crash', { msg: String(error).slice(0, 160) });
        m.flush();
      }).catch(() => {});
    } catch {}
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.hasError && !prevState.hasError) {
      setTimeout(() => {
        if (this.reloadBtnRef.current) {
          this.reloadBtnRef.current.focus();
        }
      }, 100);
    }
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown = (e) => {
    if (!this.state.hasError) return;
    if (e.key === 'Enter' || e.keyCode === 13) {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.click();
      } else {
        window.location.reload();
      }
    } else if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 8) {
      if (window.AndroidNativePlayer?.exitApp) {
        window.AndroidNativePlayer.exitApp();
      } else {
        window.location.reload();
      }
    }
  };

  handleClearCacheAndReload = () => {
    try {
      // v3.12.59 FIX: was localStorage.clear() + sessionStorage.clear() —
      // nuked watch history, favorites and cast pairing. This is the
      // recovery path used when playback misbehaves, so it must stay
      // destructive to CACHES ONLY. App state rebuilds on reload.
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
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
    } catch (e) {
      console.warn("Error clearing cache:", e);
    }
    window.location.reload();
  };

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
          <h1 style={{ fontSize: '32px', marginBottom: '16px', color: '#f87171' }}>AJO TV Recovery</h1>
          <p style={{ color: '#94a3b8', maxWidth: '600px', marginBottom: '28px', lineHeight: '1.6' }}>
            {this.state.error?.message || "An unexpected error occurred while loading this view."}
          </p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              ref={this.reloadBtnRef}
              autoFocus
              tabIndex={0}
              onClick={() => window.location.reload()}
              style={{
                padding: '14px 32px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: '3px solid transparent',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#ffffff';
                e.target.style.backgroundColor = '#38bdf8';
                e.target.style.color = '#000000';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'transparent';
                e.target.style.backgroundColor = '#0284c7';
                e.target.style.color = '#ffffff';
              }}
            >
              🔄 Reload App
            </button>
            <button
              tabIndex={0}
              onClick={this.handleClearCacheAndReload}
              style={{
                padding: '14px 32px',
                backgroundColor: '#334155',
                color: '#ffffff',
                border: '3px solid transparent',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#ffffff';
                e.target.style.backgroundColor = '#64748b';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'transparent';
                e.target.style.backgroundColor = '#334155';
              }}
            >
              🧹 Reset Cache & Restart
            </button>
          </div>
          <p style={{ marginTop: '24px', fontSize: '13px', color: '#64748b' }}>
            Remote: Press [OK] to execute • [Back] to exit
          </p>
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
