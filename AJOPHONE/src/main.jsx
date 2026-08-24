import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 28px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Reload Interface
          </button>
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
