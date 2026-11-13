// v3.17.48: 1tamilmv torrent source extractor
// Homepage -> unique topic URLs -> per-topic page (title + magnets) -> webtor.io embed.
// Uses CapacitorHttp on native (bypasses CORS) with fetch fallback on web.

const BASE = 'https://www.1tamilmv.io';
const HOME = BASE + '/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const MAGNET_RE = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'<>\s)]+/g;
const TOPIC_URL_RE = /https:\/\/www\.1tamilmv\.io\/index\.php\?\/forums\/topic\/[a-z0-9-]+\//gi;
const CACHE_KEY = 'ajo_tamilmv_v2';
const CACHE_TTL = 45 * 60 * 1000;
const MAX_TOPICS = 40;
const MAX_ITEMS = 25;
const CONCURRENCY = 5;

async function httpGetText(url) {
  try {
    const cap = await import('@capacitor/core');
    if (cap?.Capacitor?.isNativePlatform?.() && typeof cap?.CapacitorHttp?.get === 'function') {
      const res = await cap.CapacitorHttp.get({
        url,
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
        readTimeout: 12000,
        connectTimeout: 8000,
      });
      if (res && typeof res.data === 'string' && res.data.length > 0) return res.data;
    }
  } catch {}
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function extractMagnets(html) {
  const matches = html.match(MAGNET_RE) || [];
  return matches
    .map(m => m.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    .filter((v, i, a) => a.indexOf(v) === i);
}

function extractTitle(html, fallback) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (m && m[1]) return m[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return fallback || '';
}

function cleanTitle(title) {
  return title
    .replace(/^www\.1tamilmv\.\w+\s*-\s*/i, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function magnetToWebtorEmbed(magnet) {
  // v3.17.48: webtor direct-link format (docs: https://webtor.io/<magnet-uri>).
  // The /#/view?torrent= route is not recognised and falls back to the landing page.
  return 'https://webtor.io/' + encodeURIComponent(magnet);
}

function parseMeta(title) {
  const year = title.match(/\((\d{4})\)/);
  const lang = title.match(/\b(Hindi|Tamil|Telugu|Malayalam|Kannada|Bengali|Marathi|English)\b/i);
  return { year: year ? year[1] : '', language: lang ? lang[1] : '' };
}

async function scrapeTopic(topicUrl) {
  const html = await httpGetText(topicUrl);
  const magnets = extractMagnets(html);
  if (!magnets.length) return null;
  const title = cleanTitle(extractTitle(html, ''));
  if (!title) return null;
  const meta = parseMeta(title);
  return {
    id: 'tamilmv-' + topicUrl.split('/').pop().split('-')[0],
    title,
    fullTitle: title,
    topicUrl,
    magnets,
    embedUrls: magnets.map(magnetToWebtorEmbed),
    year: meta.year,
    language: meta.language,
    source: 'tamilmv',
    type: 'movie',
    category: 'torrent',
    poster: '',
  };
}

export async function getTamilmvLatest() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - cached.t < CACHE_TTL && Array.isArray(cached.items) && cached.items.length) {
        return cached.items;
      }
    }
  } catch {}

  let homeHtml;
  try {
    homeHtml = await httpGetText(HOME);
  } catch {
    return [];
  }

  const urls = [...new Set((homeHtml.match(TOPIC_URL_RE) || []))].slice(0, MAX_TOPICS);
  const out = [];

  // Bounded-concurrency topic scrape.
  const queue = [...urls];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && out.length < MAX_ITEMS) {
      const url = queue.shift();
      if (!url) break;
      try {
        const item = await scrapeTopic(url);
        if (item) out.push(item);
      } catch {}
    }
  });
  await Promise.allSettled(workers);

  // Newest first (topic ids are sequential).
  out.sort((a, b) => {
    const ai = parseInt((a.id.split('-').pop() || '0'), 10);
    const bi = parseInt((b.id.split('-').pop() || '0'), 10);
    return bi - ai;
  });

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: out }));
  } catch {}
  return out;
}
