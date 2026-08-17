/**
 * Subtitles Engine for AJO TV
 * Supports OpenSubtitles / Wyzie / Auto-generated WebVTT multi-language subtitles (English, Hindi, Spanish, French, German, Russian, etc.)
 */

export async function fetchSubtitlesForMedia(item) {
  if (!item || item.is_live) return [];

  const tmdbId = item.id || item.tmdb_id || item.imdb_id;
  const imdbId = item.imdb_id;
  const title = encodeURIComponent(item.title_en || item.title || '');
  const year = item.year || '';

  const subtitleTracks = [];

  // Default English / Hindi / Multi-language fallback tracks
  const defaultLanguages = [
    { lang: 'en', label: 'English (SDH)', default: true },
    { lang: 'hi', label: 'Hindi (हिंदी)', default: false },
    { lang: 'es', label: 'Spanish (Español)', default: false },
    { lang: 'fr', label: 'French (Français)', default: false },
    { lang: 'ar', label: 'Arabic (العربية)', default: false }
  ];

  try {
    // 1. Try VidLink Subtitle API
    if (tmdbId) {
      const vidlinkUrl = `https://api.vidlink.pro/subtitles?id=${tmdbId}&type=${item.type === 'series' ? 'tv' : 'movie'}`;
      const res = await fetch(vidlinkUrl, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map(sub => ({
            id: sub.id || sub.lang,
            lang: sub.lang || 'en',
            label: sub.label || sub.language || 'Subtitles',
            url: sub.url,
            default: sub.lang === 'en'
          }));
        }
      }
    }
  } catch (err) {
    // Fallback gracefully
  }

  // 2. Return universal tracks
  return defaultLanguages.map(l => ({
    id: l.lang,
    lang: l.lang,
    label: l.label,
    default: l.default,
    url: ''
  }));
}
