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

/**
 * v3.12.69: strict popular-channel keep-list. The old language filter had a
 * permissive catch-all (any category Entertainment/Movies/News/Sports passed),
 * which let ~1000 junk FAST channels, foreign-language news, and stream spam
 * into the wall. This list is the user's explicit curation:
 *   - Star, Sony (incl. sports), ESPN, Colors, Zee families
 *   - Hindi / Marathi / English news only
 *   - Discovery, Epic, Animal Planet, Nat Geo, History
 *   - Entertainment & movies: Marathi, Hindi, English only
 */
export const KEEP_CHANNEL_PATTERNS = [
  // Star family
  'star plus', 'star bharat', 'star pravah', 'star gold', 'star utsav',
  'star movies', 'star world', 'star sports', 'star cricket', 'star suvarna',
  // Sony family (all incl. sports)
  'sony', 'set hd', 'set india', 'ten 1', 'ten 2', 'ten 3', 'ten 4', 'ten 5',
  'sony sports', 'sony ten', 'sony six', 'sony wah', 'sony max', 'sony pal',
  'sony sab', 'sony pix', 'sony yay', 'sony bbc earth', 'sony marathi',
  // ESPN
  'espn',
  // Colors family
  'colors',
  // Zee family (incl. &tv/&pictures which are Zee brands)
  'zee', '&tv', '&pictures', 'and tv', 'andpictures',
  // Hindi / Marathi / English news
  'aaj tak', 'ndtv', 'republic', 'abp', 'tv9', 'india today', 'times now',
  'news18', 'wion', 'dd news', 'dd india', 'dd national', 'mirror now',
  'news9', 'news 9', 'india tv', 'newsx', 'lokmat', 'saam tv', 'jai maharashtra',
  'zee 24 taas', 'zee business', 'zee news', 'zee hindustan',
  // Infotainment / documentary
  'discovery', 'animal planet', 'national geographic', 'nat geo', 'history tv',
  'epic', 'sony bbc earth', 'travelxp', 'tlc', 'discovery turbo', 'discovery science',
  // Entertainment & movies (Marathi / Hindi / English)
  'zee cinema', 'zee marathi', 'zee anmol', 'zee talkies', 'zee studio',
  'zee cafe', 'zee classic', 'zee action', 'zee lf', 'goldmines', 'dangal',
  'enter10', 'enterr10', 'manoranjan', 'shemaroo', 'b4u', '9x', 'fakt marathi',
  'sangeet marathi', 'movies now', 'mn+', 'mn+', 'sony max 2', 'picture',
  'star gold', 'star utsav', 'hungama', 'pogo', 'cartoon network', 'nickelodeon',
  'nick', 'sonic', 'disney', 'colors cineplex', 'colors infinity', 'colors rishtey',
  'colors marathi', 'colours', 'rishtey', 'utv movies', 'utv action',
  'hindi cinema', 'bollywood', 'marathi', 'sony pix'
];

/**
 * v3.12.70: the Sony feed logos point at sonypicturesnetworks.com which 403s
 * hotlinking. Repair the known-dead ones to the tv-logos mirror (all probe 200
 * image/png). Anything else that fails gets a fallback tile client-side.
 */
const LOGO_REPAIRS = [
  [/\bset hd\b|\bsony entertainment television\b.*\bhd\b/i, 'sony-entertainment-television-hd-in.png'],
  [/\bsony sab hd\b/i, 'sony-sab-hd-in.png'],
  [/\bsony sab\b/i, 'sony-sab-in.png'],
  [/\bsony pal hd\b/i, 'sony-pal-hd-in.png'],
  [/\bsony pal\b/i, 'sony-pal-in.png'],
  [/\bsony wah hd\b/i, 'sony-wah-hd-in.png'],
  [/\bsony wah\b/i, 'sony-wah-in.png'],
  [/\bsony max 2 hd\b|\bsony max2 hd\b/i, 'sony-max-2-hd-in.png'],
  [/\bsony max 2\b|\bsony max2\b/i, 'sony-max-2-in.png'],
  [/\bsony max hd\b/i, 'sony-max-hd-in.png'],
  [/\bsony max\b/i, 'sony-max-in.png'],
  [/\bsony sports ten 1 hd\b|\bsony ten 1 hd\b/i, 'sony-ten-1-hd-in.png'],
  [/\bsony sports ten 1\b|\bsony ten 1\b/i, 'sony-ten-1-in.png'],
  [/\bsony sports ten 2 hd\b|\bsony ten 2 hd\b/i, 'sony-ten-2-hd-in.png'],
  [/\bsony sports ten 2\b|\bsony ten 2\b/i, 'sony-ten-2-in.png'],
  [/\bsony sports ten 3 hd\b|\bsony ten 3 hd\b/i, 'sony-ten-3-hd-in.png'],
  [/\bsony sports ten 3\b|\bsony ten 3\b/i, 'sony-ten-3-in.png'],
  [/\bsony sports ten 4 hd\b|\bsony ten 4 hd\b/i, 'sony-ten-4-hd-in.png'],
  [/\bsony sports ten 4\b|\bsony ten 4\b/i, 'sony-ten-4-in.png'],
  [/\bsony sports ten 5 hd\b|\bsony ten 5 hd\b|\bsony six hd\b/i, 'sony-ten-5-hd-in.png'],
  [/\bsony sports ten 5\b|\bsony ten 5\b|\bsony six\b/i, 'sony-ten-5-in.png'],
  [/\bsony yay\b/i, 'sony-yay-in.png'],
  [/\bsony bbc earth hd\b/i, 'sony-bbc-earth-hd-in.png'],
  [/\bsony bbc earth\b/i, 'sony-bbc-earth-in.png'],
  [/\bsony pix hd\b/i, 'sony-pix-hd-in.png'],
  [/\bsony pix\b/i, 'sony-pix-in.png'],
  [/\bsony marathi hd\b/i, 'sony-marathi-in.png'],
  [/\bsony marathi\b/i, 'sony-marathi-in.png']
];

function repairLiveLogo(name, logo) {
  if (!name) return logo || '';
  if (logo && !/sonypicturesnetworks\.com/i.test(logo)) return logo;
  for (const [re, file] of LOGO_REPAIRS) {
    if (re.test(name)) return `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/${file}`;
  }
  return logo || '';
}

/**
 * v3.12.70: streams probed live right now. The old 51.75.127.199 relay farm is
 * dead (connection refused on every Star/Sony path), so any channel whose ONLY
 * player lives there gets dropped from the wall instead of failing at play time.
 */
export const DEAD_STREAM_HOST_PATTERNS = [
  /(^|\.)51\.75\.127\.199$/i,
  /(^|\.)38\.96\.178\.203$/i,
  /(^|\.)59\.103\.38\.40$/i,
  /(^|\.)59\.103\.38\.46$/i,
  /(^|\.)202\.70\.146\.135$/i,
  /(^|\.)tvsen5\.aynascope\.net$/i,
  /(^|\.)tvsen5\.aynaott\.com$/i
];

/**
 * v3.12.70: known-live HD mirrors for channels whose primary feed is dead.
 * Applied after merge so legacy iptv entries get a working server first.
 */
export const LIVE_SOURCE_OVERRIDES = [
  { match: /star sports 1(?!.*(hindi|tamil|telugu))/i, url: 'https://cdn.buzogezapimuyoku.cc/live/star-sports-1-hindi-hd/index.m3u8', label: 'Server 1 (Verified HD)' },
  { match: /star sports 2(?!.*(hindi|tamil|telugu|english))/i, url: 'http://103.151.60.162:2122/play/a00v/index.m3u8?hls', label: 'Server 1 (Verified HD)' },
  { match: /star gold hd/i, url: 'http://103.185.24.134:3001/Star-Gold/index.m3u8', label: 'Server 1 (Verified HD)' },
  { match: /star gold 2 hd/i, url: 'http://103.151.60.162:2122/play/a01v/index.m3u8?hls', label: 'Server 1 (Verified HD)' },
  { match: /star pravah hd/i, url: 'https://da86m1sqpm3o0.cloudfront.net/28072023/smil:starpravah.smil/chunklist_b1928000.m3u8', label: 'Server 1 (Verified HD)' },
  { match: /star sports select 1/i, url: 'http://103.151.60.162:2122/play/a026/index.m3u8?hls', label: 'Server 1 (Verified HD)' },
  { match: /star sports select 2/i, url: 'http://103.151.60.162:2122/play/a027/index.m3u8?hls', label: 'Server 1 (Verified HD)' },
  { match: /star plus hd/i, url: 'http://38.96.178.205/STARPLUS/index.m3u8', label: 'Server 1 (Verified HD)' }
];

const DEAD_STREAM_URL_SUBSTRINGS = [
  '/play/a029/index.m3u8', // Star Sports 3 playlist path — 404 (probed)
  '/play/a032/index.m3u8', // Star Kiran — 404 (probed)
  '/play/a01a/index.m3u8', // Star Sports 1 alt — 404 (probed)
  '/play/a019/index.m3u8', // Star Sports 2 alt — 404 (probed)
  '/play/a01n/index.m3u8', // Star Gold alt — 404 (probed)
  '/live/star-sports-3/index.m3u8', // Star Sports 3 English — 404 (probed)
  'adaptive-streams/refs/heads/main/streams/gb/YuppTV/UtsavBharat.m3u8' // 200 text/plain, not a stream
];

export function isDeadStreamUrl(url) {
  if (!url) return true;
  try {
    const h = new URL(url).hostname;
    if (DEAD_STREAM_HOST_PATTERNS.some((p) => p.test(h))) return true;
    return DEAD_STREAM_URL_SUBSTRINGS.some((x) => String(url).includes(x));
  } catch { return true; }
}

export function hasWorkingPlayer(ch) {
  const players = Array.isArray(ch.players) && ch.players.length
    ? ch.players.map((p) => p?.url || p)
    : [ch.url];
  return players.some((u) => u && !isDeadStreamUrl(u));
}

/**
 * v3.12.70: verified-live primary URLs. The wall merged playlists put dead
 * relays first (51.75.127.199), so every Star channel opened on a dead server
 * and burned a failover before playing. These reorder the player list so the
 * probed-live HD feed is Server 1. Channels with no live feed are dropped by
 * hasWorkingPlayer after the reorder.
 */
export const VERIFIED_LIVE_URLS = new Set([
  'https://cdn.buzogezapimuyoku.cc/live/star-sports-1-hindi-hd/index.m3u8',
  'https://cdn.buzogezapimuyoku.cc/live/star-sports-2-hindi-hd/index.m3u8',
  'http://103.151.60.162:2122/play/a00v/index.m3u8?hls',
  'https://cdn.buzogezapimuyoku.cc/live/star-sports-select-hd1/index.m3u8',
  'https://cdn.buzogezapimuyoku.cc/live/star-sports-select-hd2/index.m3u8',
  'https://cdn.buzogezapimuyoku.cc/live/star-bharat-hd/index.m3u8',
  'https://cdn.buzogezapimuyoku.cc/live/star-plus-hd/index.m3u8',
  'http://103.185.24.134:3001/Star-Gold/index.m3u8',
  'http://103.151.60.162:2122/play/a01v/index.m3u8?hls',
  'https://da86m1sqpm3o0.cloudfront.net/28072023/smil:starpravah.smil/chunklist_b1928000.m3u8',
  'http://103.151.60.162:2122/play/a026/index.m3u8?hls',
  'http://103.151.60.162:2122/play/a027/index.m3u8?hls',
  'http://38.96.178.205/STARPLUS/index.m3u8'
]);

export function applyLiveSourceOverride(ch) {
  const title = String(ch.title_en || ch.title || ch.name || '');
  const players = Array.isArray(ch.players) && ch.players.length
    ? [...ch.players]
    : [{ name: 'Server 1 (Auto)', url: ch.url, source: 'hls' }];

  // Drop known-dead hosts/paths outright.
  const livePlayers = players.filter((p) => !isDeadStreamUrl(p?.url || p));

  // Exact-match overrides win (verified URL for that exact title).
  for (const o of LIVE_SOURCE_OVERRIDES) {
    if (o.match.test(title)) {
      const verified = { name: o.label, url: o.url, source: 'hls', quality: 'HD' };
      const rest = livePlayers.filter((p) => (p?.url || p) !== o.url);
      const next = [verified, ...rest];
      return { ...ch, url: o.url, players: next, player: next };
    }
  }

  // Otherwise, promote any probed-live URL to Server 1.
  const firstLiveIdx = livePlayers.findIndex((p) => VERIFIED_LIVE_URLS.has(p?.url || p));
  if (firstLiveIdx > 0) {
    const [best] = livePlayers.splice(firstLiveIdx, 1);
    const next = [best, ...livePlayers];
    return { ...ch, url: best?.url || best, players: next, player: next };
  }
  const next = livePlayers.length ? livePlayers : players;
  return { ...ch, players: next, player: next, url: next[0]?.url || next[0] || ch.url };
}

export function isPopularLiveChannel(raw) {
  if (!raw) return false;
  const name = String(raw.name || raw.title || raw.title_en || '').toLowerCase();
  const lang = String(raw.lang || raw.language || '').toLowerCase().trim();
  // Explicitly block junk that sneaks pattern matches
  if (/^episode \d+/.test(name)) return false;
  if (/horror tv|fight tv|sofast|hubstream|trufa|weshort|kung fu|tensions tv|english tv$/.test(name)) return false;
  // Regional-language variants the user explicitly does not want (keep only
  // Hindi / Marathi / English). These match brand patterns but are wrong-language.
  if (/bangla|bengali|ananda|aath|kannada|gujarati|asmita|telugu|tamil|malayalam|punjabi|bhojpuri|bihar jharkhand|madhya pradesh|chhattisgarh|delhi ncr haryana|up uk|rajasthan news|gujarat|odia|assam/.test(name)) return false;
  // Foreign/geo variants and non-Indian Pluto/other-region feeds
  if (/al jazeera|czech|romania|russia|español|espanol|pluto tv|mbc bollywood|afroland|nagaland|travelxp russia|south flix|zee one\b/.test(name)) return false;
  // Regional state channels (not Hindi/Marathi/English national news)
  if (/news18 kerala|news18 punjab|news18 rajasthan|news18 uttar pradesh|zee punjab|zee uttar pradesh|zee rajasthan|zee cinemalu|zee cinema apac/.test(name)) return false;
  // Language guard: non Hindi/Marathi/English channels are out even if brand matches
  if (lang && !/^(hin|hi|hindi|mar|mr|marathi|eng|en|english)/.test(lang)) return false;
  return KEEP_CHANNEL_PATTERNS.some((p) => name.includes(p));
}

/**
 * v3.12.69: classify a channel by ITS NAME, not the feed's category label.
 * The aggregator feed mislabels badly (DD India, Zee Hindustan, Zee Business
 * all arrive tagged "Sports"), so trusting feed categories put news channels
 * in the Sports shelf. Name-based rules below run in priority order.
 */
export function classifyLiveChannel(name) {
  const n = String(name || '').toLowerCase().trim();

  // Sports — explicit sports brands only.
  if (/star sports|sony sports|sony ten|sony six|ten 1|ten 2|ten 3|ten 4|ten 5|espn|sports 18|sport 18|dd sports|eurosport|fancode|willow|star cricket|cricket|kabaddi|wwe|wrestling/.test(n)) return 'Sports';

  // Lifestyle exceptions before news brands.
  if (/good ?times/.test(n)) return 'Entertainment';
  if (/^manoranjan tv$/.test(n)) return 'Entertainment';
  // News — national + Hindi/Marathi/English news brands.
  if (/aaj tak|ndtv|republic|abp|tv9|india today|times now|news18|wion|dd news|dd india|dd national|mirror now|news9|news 9|india tv|newsx|lokmat|saam|jai maharashtra|zee 24 taas|zee business|zee news|zee hindustan|zee rajasthan|zee bihar|zee delhi|zee madhya|zee up|zee madhya pradesh|cnn|news24|news nation|the news|top news|news marathi|awaaz|bharat samachar|hindi khabar|sudarshan|good news|first india|live today|news live|india voice|khabrein|jantantra|jan tv|total tv|network 10|ganga|bharatvarsh/.test(n)) return 'News';

  // Kids — kids/animation brands.
  if (/cartoon network|pogo|nickelodeon|nick jr|nick |sonic|disney|hungama|sony yay|discovery kids|cbeebies|kids|baby|rhymes/.test(n)) return 'Kids';

  // Movies — movie/cinema brands.
  if (/star gold|star movies|star utsav movies|sony max|sony pix|zee cinema|zee anmol|zee classic|zee action|zee talkies|&pictures|&pictures|movies now|mn+|mnplus|goldmines|dangal|enter10|enterr10|manoranjan|b4u|picture|cinema|bollywood|movie|utv movies|utv action|zee one|sony max2|sony max 2|colors cineplex|star gold|9x tashan|shemaroo|epic on/.test(n)) return 'Movies';
  if (/b4u music|filmi gaane|music/.test(n)) return 'Entertainment';

  // Infotainment / documentary / travel / lifestyle / music → Entertainment.
  return 'Entertainment';
}

export function normalizeLiveChannel(raw) {
  if (!raw || !raw.url) return null;
  const name = String(raw.name || 'Live Channel').trim();
  return {
    id: raw.id || name.toLowerCase().replace(/\s+/g, '-'),
    title: name,
    title_en: name,
    name,
    poster: repairLiveLogo(name, raw.logo),
    logo: repairLiveLogo(name, raw.logo),
    // v3.12.69: name-based classification — the feed's own category is
    // unreliable (news channels arrive tagged Sports).
    category: classifyLiveChannel(name),
    lang: raw.lang || '',
    url: raw.url,
    players: [{ url: raw.url, label: 'Live', drm: raw.drm, headers: raw.headers, kind: raw.kind }],
    is_live: true,
    type: 'live',
    year: 'LIVE',
    drm: raw.drm || null,
    headers: raw.headers || null,
    kind: raw.kind || 'hls',
    source: raw.source || 'ajo-live'
  };
}

export async function getLiveChannels() {
  // localStorage cache first (stick is slow; the curated payload is tiny)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { t, channels } = JSON.parse(cached);
      if (Date.now() - t < TTL && Array.isArray(channels) && channels.length) {
        return channels.filter(isPopularLiveChannel).map(normalizeLiveChannel).filter(Boolean);
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

/**
 * v3.12.69: five clean shelves, classified by channel name (see
 * classifyLiveChannel) rather than the feed's unreliable category label.
 */
export function groupByCategory(channels) {
  const groups = new Map();
  for (const ch of channels) {
    const cat = classifyLiveChannel(ch.title_en || ch.title || ch.name);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(ch);
  }
  return groups;
}
