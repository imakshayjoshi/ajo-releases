const REQUEST_TIMEOUT_MS = 4000;

export async function fetchSubtitlesForMedia(item) {
  if (!item || item.is_live) return [];
  const tmdbId = item.tmdb_id || item.id;
  if (!tmdbId) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const type = ['series', 'serial', 'serials', 'tv'].includes(item.type) ? 'tv' : 'movie';
    const response = await fetch(`https://api.vidlink.pro/subtitles?id=${encodeURIComponent(tmdbId)}&type=${type}`, { signal: controller.signal });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.flatMap((track, index) => {
      if (!track?.url || !/^https?:\/\//i.test(track.url)) return [];
      return [{ id: track.id || `${track.lang || 'und'}-${index}`, lang: track.lang || 'und', label: track.label || track.language || track.lang || 'Subtitles', url: track.url, default: Boolean(track.default || track.lang === 'en') }];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
