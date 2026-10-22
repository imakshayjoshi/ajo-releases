/**
 * AJO Live Channels — Elite Streams feed merge (v3.12.64)
 *
 * Source: https://new.ajo.co.in/live/channels.json — VPS aggregator that
 * merges Elite Streams' live feeds (jio-tv-api, premiumplugx jiostb,
 * hotstar, sliv, zee5, yupp, dangal, biggboss), health-checks every
 * manifest, and normalizes categories. Refreshes every 15 min server-side.
 *
 * Channel shape:
 *   { id, name, logo, category, lang, url, kind: 'hls'|'dash',
 *     drm: {type:'clearkey', keys:[[kid,key],...]} | null,
 *     headers: {Cookie|User-Agent|Referer|Origin} | null }
 *
 * DRM channels need the native ClearKey path (media3 in PlayerActivity).
 * All others are direct HLS — handed straight to ExoPlayer.
 */

const LIVE_URL = 'https://new.ajo.co.in/live/channels.json';
const CACHE_KEY = 'ajo_live_channels_v3';
const TTL = 10 * 60 * 1000; // 10 min client cache (server refreshes 15 min)

// v3.9.7: user's explicit live-TV whitelist (Oct 21 2026). Same strict
// core-name matching as the TV apps — exact channels only, SD/HD variants
// kept, Marathi/Hindi/English only.
const LIVE_WHITELIST_RAW = `
star sports 1|star sports 2|star sports 3|star sports select 1|star sports select 2|star sports 1 hindi|star sports 2 hindi|star sports khel|star sports 1 marathi|sports18 1|sports18 2|sports18 3|sports18 khel|sony sports ten 1|sony sports ten 2|sony sports ten 3|sony sports ten 5|eurosport|dd sports
star pravah|zee marathi|colors marathi|sony marathi|sun marathi|dd sahyadri
zee talkies|pravah picture|zee chitramandir|shemaroo marathibana|fakt marathi|chumbak tv
abp majha|tv9 marathi|zee 24 taas|news18 lokmat|saam tv|ndtv marathi|jai maharashtra|lokshahi marathi|pudhari news
9x jhakaas|sangeet marathi|maiboli
star plus|sony entertainment television|set|sony sab|colors tv|zee tv|&tv|and tv|star bharat|dangal|dangal 2|sony pal|zee anmol|colors rishtey|star utsav|shemaroo umang|shemaroo tv|big magic|ishara tv|nazara tv|dd national|mtv india|good times
zee cafe|colors infinity
sony max|sony max 2|sony wah|star gold|star gold 2|star gold romance|star gold thrills|stargold select|star utsav movies|zee cinema|zee classic|zee action|zee bollywood|zee anmol cinema|&pictures|and pictures|&xplor hd|colors cineplex|colors cineplex bollywood|colors cineplex superhits|goldmines|goldmines bollywood|goldmines movies|b4u movies|b4u kadak|manoranjan tv
star movies|star movies select|sony pix|&flix|and flix|&prive hd|movies now|mnx|mn+ hd|romedy now
9xm|mastiii|mtv beats|b4u music|zoom|zing|sony mix|showbox|e24|vh1|9xo
discovery channel|animal planet|discovery science|discovery turbo|investigation discovery|national geographic|nat geo|nat geo wild|history tv18|sony bbc earth|epic tv|tlc|fox life|travelxp
cartoon network|pogo|nickelodeon|nick|sonic|nick jr|disney channel|disney junior|hungama tv|super hungama|sony yay|discovery kids|gubbare|etv bal bharat|cbeebies
aaj tak|abp news|india tv|ndtv india|republic bharat|news18 india|zee news|times now navbharat|good news today|news24|news nation|bharat24|dd news|sansad tv|cnbc awaaz|zee business|et now swadesh|ndtv profit hindi
times now|republic tv|india today|cnn-news18|ndtv 24x7|mirror now|wion|dd india|bbc world news|cnn international|al jazeera english|cnbc-tv18|et now|ndtv profit
`;

export function squashLiveName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9+& ]/g, ' ')
    .replace(/\b(hd|fhd|sd|uhd|4k|india|in|\+1|live)\b/g, ' ')
    .replace(/[^a-z0-9+]/g, '')
    .trim();
}

const LIVE_WHITELIST = new Set(
  LIVE_WHITELIST_RAW.split(/[|\n]/).map((w) => squashLiveName(w)).filter(Boolean)
);

const LIVE_WHITELIST_ALIASES = { ndtvgoodtimes: 'goodtimes' };

const BANNED_LANG_RE = /bangla|bengali|ananda|aath|kannada|gujarati|asmita|telugu|tamil|malayalam|punjabi|bhojpuri|bihar jharkhand|madhya pradesh|chhattisgarh|delhi ncr haryana|up uk|rajasthan|gujarat|odia|assam/;

export function isPopularLiveChannel(raw) {
  // v3.9.11: bhoom-sourced channels are pre-curated Indian free-to-air
  // (1,000+ channels from the BHOOM TV directory scrape) — they bypass the
  // 45-name English/Hindi whitelist that exists to filter the junk legacy
  // iptv-org feeds. The VPS feed health-checks them every 10 min.
  if (raw && (raw.source === 'bhoom' || String(raw.id || '').startsWith('bhoom-'))) return true;
  if (!raw) return false;
  const name = String(raw.name || raw.title || '').toLowerCase();
  if (/^episode \d+/.test(name)) return false;
  if (BANNED_LANG_RE.test(name)) return false;
  const lang = String(raw.lang || '').toLowerCase().trim();
  if (lang && !/^(hin|hi|hindi|mar|mr|marathi|eng|en|english)/.test(lang)) return false;
  const sq = squashLiveName(raw.name || raw.title || '');
  if (!sq) return false;
  if (LIVE_WHITELIST.has(sq)) return true;
  for (const [from, to] of Object.entries(LIVE_WHITELIST_ALIASES)) {
    if (sq === from && LIVE_WHITELIST.has(to)) return true;
  }
  return false;
}


export function normalizeLiveChannel(raw) {
  if (!raw || !raw.url) return null;
  // v3.9.9: the phone's web player is HLS-only. DASH/ClearKey primaries
  // (jio official) can't play here — but the aggregator now carries plain
  // HLS mirrors as alt_urls, so swap one in as the phone's primary instead
  // of dropping the channel entirely. This is what puts Star Sports on phone.
  let url = raw.url;
  let kind = String(raw.kind || 'hls').toLowerCase();
  if (kind === 'dash' || raw.drm) {
    const alt = Array.isArray(raw.alt_urls) ? raw.alt_urls.find((u) => typeof u === 'string' && /\.m3u8/i.test(u)) : null;
    if (!alt) return null;
    url = alt;
    kind = 'hls';
  }
  const name = String(raw.name || 'Live Channel').trim();
  return {
    id: raw.id || name.toLowerCase().replace(/\s+/g, '-'),
    title: name,
    title_en: name,
    name,
    poster: raw.logo || '',
    logo: raw.logo || '',
    category: raw.category || 'Entertainment',
    lang: raw.lang || '',
    url,
    players: [{ url, label: 'Live', drm: null, headers: null, kind }],
    is_live: true,
    type: 'live',
    year: 'LIVE',
    drm: null,
    headers: null,
    kind,
    source: raw.source || 'ajo-live'
  };
}

export async function getLiveChannels() {
  // localStorage cache first (stick is slow, 190-channel payload ~100KB)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { t, channels } = JSON.parse(cached);
      if (Date.now() - t < TTL && Array.isArray(channels) && channels.length) {
        return channels.map(normalizeLiveChannel).filter(Boolean);
      }
    }
  } catch { /* corrupt cache — refetch */ }

  const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
  if (!res.ok) throw new Error('live catalog http ' + res.status);
  const data = await res.json();
  const channels = (Array.isArray(data.channels) ? data.channels : []).filter(isPopularLiveChannel);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), channels }));
  } catch { /* storage full — fine */ }
  return channels.map(normalizeLiveChannel).filter(Boolean);
}

export function groupByCategory(channels) {
  const groups = new Map();
  for (const ch of channels) {
    const cat = ch.category || 'Entertainment';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(ch);
  }
  return groups;
}
