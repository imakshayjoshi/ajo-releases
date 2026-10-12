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
const CACHE_KEY = 'ajo_live_channels_v4';
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
  [/\bsony marathi\b/i, 'sony-marathi-in.png'],
  // v3.12.73: channels that still slipped through on 403 sonypicturesnetworks logos
  [/\bsony aath\b/i, 'sony-aath-in.png'],
  [/\bsony sports ten 4 tamil\b/i, 'sony-ten-4-in.png'],
  [/\bsony sports ten 4 telugu\b/i, 'sony-ten-4-in.png'],
  [/\bsony sports ten 4\b/i, 'sony-ten-4-in.png'],
  [/\bset hd\b/i, 'sony-entertainment-television-hd-in.png']
];

function repairLiveLogo(name, logo) {
  if (!name) return logo || '';
  if (logo && !/sonypicturesnetworks\.com/i.test(logo)) return logo;
  for (const [re, file] of LOGO_REPAIRS) {
    if (re.test(name)) return `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/${file}`;
  }
  return logo || '';
}

// v3.12.73 (live thumbnails fix): serve feed logos through our VPS image
// proxy. Some devices resolve/route specific CDNs badly (the stick already
// needed the TMDB image proxy for the same reason), and the proxy also
// normalizes spec-invalid CORS from jio/xstreamcp/amagi logo servers.
const LOGO_PROXY = 'https://new.ajo.co.in/channels/logo?u=';
const LOGO_PROXY_HOSTS = [
  'd229kpbsb5jevy.cloudfront.net',
  'xstreamcp-assets-msp.streamready.in',
  'amagi.tv',
  'jiotvimages.cdn.jio.com',
  'jiotv.cdn.jio.com',
  'jiotv.catchup.cdn.jio.com'
];
function proxyLiveLogo(logo) {
  if (!logo) return logo;
  try {
    const h = new URL(logo).hostname;
    if (LOGO_PROXY_HOSTS.some((host) => h === host || h.endsWith('.' + host))) {
      return LOGO_PROXY + encodeURIComponent(logo);
    }
  } catch { /* invalid url — keep as-is */ }
  return logo;
}

// v3.12.84: on-device logo rescue. The stick routes some logo CDNs badly
// (same reason TMDB needed a proxy), so when a direct logo 404s/errors on the
// TV, LiveView retries ONCE through the VPS proxy — but only for hosts the
// proxy actually serves (cloudfront/jio/amagi verified 200; it 403s
// raw.githubusercontent and hotstar is geo-blocked from the VPS, so those
// stay direct-or-initials). Returns null when the host is not rescuable.
export function liveLogoProxyUrl(logo) {
  if (!logo || typeof logo !== 'string') return null;
  if (logo.startsWith(LOGO_PROXY)) return null;
  try {
    const h = new URL(logo).hostname;
    if (LOGO_PROXY_HOSTS.some((host) => h === host || h.endsWith('.' + host))) {
      return LOGO_PROXY + encodeURIComponent(logo);
    }
  } catch { /* invalid */ }
  return null;
}
function safeLiveLogo(name, logo) {
  // v3.12.84: repair dead hosts, then fill missing logos from the channel NAME
  // (the legacy/iptv sources the wall opens on — Sony/Star/Colors/Zee — carry
  // no logo field at all, which is why the user saw initials everywhere).
  const repaired = repairLiveLogo(name, logo);
  if (!repaired) {
    const guessed = guessLiveLogo(name);
    if (guessed) return guessed;
  }
  return repaired || '';
}

// ---------------------------------------------------------------------------
// v3.12.84: name-based logo resolution against the tv-logos India repo.
// Every candidate is verified against the embedded real file list, so a guess
// never 404s — it either maps to a file that exists or returns null (initials).
// ---------------------------------------------------------------------------
const TVLOGOS_BASE = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/';

// Brand rules for channels whose slug doesn't match the repo naming
// (checked before the generic guesser; first match wins).
const LOGO_BRAND_RULES = [
  [/\bsony\s+(?:sports\s+)?ten\s*1\b/i, 'sony-ten-1-in.png'],
  [/\bsony\s+(?:sports\s+)?ten\s*2\b/i, 'sony-ten-2-in.png'],
  [/\bsony\s+(?:sports\s+)?ten\s*3\b/i, 'sony-ten-3-in.png'],
  [/\bsony\s+(?:sports\s+)?ten\s*4\b/i, 'sony-ten-4-in.png'],
  [/\bsony\s+(?:sports\s+)?ten\s*5\b|\bsony\s+six\b/i, 'sony-ten-5-in.png'],
  [/\bsony\s+sports\s*1\b/i, 'sony-ten-1-in.png'],
  [/\bsony\s+sports\s*2\b/i, 'sony-ten-2-in.png'],
  [/\bsony\s+sports\s*3\b/i, 'sony-ten-3-in.png'],
  [/\bsony\s+sports\s*4\b/i, 'sony-ten-4-in.png'],
  [/\bsony\s+sports\s*5\b/i, 'sony-ten-5-in.png'],
  [/\bstar\s+sports\s+select\s*1\b/i, 'star-sports-select-1-in.png'],
  [/\bstar\s+sports\s+select\s*2\b/i, 'star-sports-select-2-in.png'],
  [/\bstar\s+sports\s*1\s+hindi\b/i, 'star-sports-1-hindi-in.png'],
  [/\bstar\s+sports\s*1\b/i, 'star-sports-1-in.png'],
  [/\bstar\s+sports\s*2\b/i, 'star-sports-2-in.png'],
  [/\bstar\s+sports\s*3\b/i, 'star-sports-3-in.png'],
  [/\bstar\s+plus\b/i, 'star-plus-hd-in.png'],
  [/\bstar\s+bharat\b/i, 'star-bharat-in.png'],
  [/\bstar\s+pravah\b/i, 'star-pravah-in.png'],
  [/\bstar\s+gold\b/i, 'star-gold-hd-in.png'],
  [/\bcolors\s+rishtey\b/i, 'colors-rishtey-in.png'],
  [/\bcolors\s+(?:mena|super)\b/i, 'colors-in.png'],
  [/\brepublic\s+bharat\b/i, 'republic-bharat-tv-in.png'],
  [/\brepublic\b/i, 'republic-tv-in.png'],
  [/\bsony\s+entertainment\s+television\b|\bset\s+hd\b/i, 'sony-entertainment-television-hd-in.png'],
  [/\bsony\s+sab\b/i, 'sony-sab-hd-in.png'],
  [/\bsony\s+max\s*2\b/i, 'sony-max-2-hd-in.png'],
  [/\bsony\s+max\b/i, 'sony-max-hd-in.png'],
  [/\bsony\s+marathi\b/i, 'sony-marathi-in.png'],
  [/\bsony\s+pix\b/i, 'sony-pix-hd-in.png'],
  [/\bsony\s+pal\b/i, 'sony-pal-in.png'],
  [/\bsony\s+wah\b/i, 'sony-wah-in.png'],
  [/\bsony\s+yay\b/i, 'sony-yay-in.png'],
  [/\bsony\s+aath\b/i, 'sony-aath-in.png'],
  [/\bsony\s+bbc\s+earth\b/i, 'sony-bbc-earth-hd-in.png'],
  [/\baaj\s+tak\b/i, 'aaj-tak-in.png'],
  [/\bndtv\s*24\s*[x×]\s*7\b/i, 'ndtv-24x7-in.png'],
  [/\bndtv\s+india\b/i, 'ndtv-india-in.png'],
  [/\bzee\s+news\b/i, 'zee-news-in.png'],
  [/\bzee\s+tv\b/i, 'zee-tv-hd-in.png'],
  [/\bzee\s+cinema\b/i, 'zee-cinema-in.png'],
  [/\bzee\s+talkies\b/i, 'zee-talkies-in.png'],
  [/\bzee\s+action\b/i, 'zee-action-in.png'],
  [/\bzee\s+classic\b/i, 'zee-classic-in.png'],
  [/\bzee\s+bharat\b/i, 'zee-bharat-in.png'],
  [/\bzee\s+business\b/i, 'zee-business-in.png'],
  [/\bzee\s+24\s+taas\b/i, 'zee-24-taas-in.png'],
  [/\bcolors\s+marathi\b/i, 'colors-marathi-in.png'],
  [/\bcolors\s+infinity\b/i, 'colors-infinity-in.png'],
  [/\bcolors\s+cineplex\b/i, 'colors-cineplex-in.png'],
  [/\bcolors\b/i, 'colors-in.png'],
];

const LIVE_LOGO_QUALITY_TOKENS = new Set(['hd', 'sd', 'fhd', 'uhd', '4k', 'tv', 'channel', 'live']);

function liveLogoSlugTokens(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, ' ')       // drop "(24/7 TMKOC)" style suffixes
    .replace(/&/g, ' and ')
    .replace(/[''.]/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Resolve a channel NAME to a tv-logos India URL that is guaranteed to exist
 * (verified against the embedded file list). Returns null when nothing maps —
 * the caller then shows the initials tile.
 */
export function guessLiveLogo(name) {
  if (!name) return null;
  for (const [re, file] of LOGO_BRAND_RULES) {
    if (re.test(name)) {
      if (TVLOGOS_INDIA.has(file)) return TVLOGOS_BASE + file;
      break;
    }
  }
  const toks = liveLogoSlugTokens(name);
  if (!toks.length) return null;
  const noQuality = toks.filter((t) => !LIVE_LOGO_QUALITY_TOKENS.has(t));
  const candidates = [];
  const full = toks.join('-');
  const base = noQuality.join('-');
  if (full) candidates.push(full + '-in.png');
  if (base && base !== full) candidates.push(base + '-in.png');
  if (base) candidates.push(base + '-hd-in.png');
  if (base) candidates.push(base + '-in.png');
  for (const c of candidates) {
    if (TVLOGOS_INDIA.has(c)) return TVLOGOS_BASE + c;
  }
  return null;
}

// v3.12.84: real file list of tv-logo/tv-logos countries/india, embedded so
// name-based logo guesses never 404. Regenerate from the repo tree if the app
// adds channels whose logos are missing.
const TVLOGOS_INDIA_FILES = ['1sports-in.png', '9x-jalwa-in.png', '9x-jhakaas-in.png', '9x-tashan-in.png', '9xm-in.png', 'a1tv-in.png', 'aaj-tak-hd-in.png', 'aaj-tak-in.png', 'aakash-aath-in.png', 'aastha-bhajan-in.png', 'aastha-in.png', 'abp-ananda-in.png', 'abp-asmita-in.png', 'abp-ganga-in.png', 'abp-majha-in.png', 'abp-news-in.png', 'abzy-cool-in.png', 'abzy-movies-in.png', 'alankar-tv-in.png', 'anaadi-tv-in.png', 'and-flix-hd-in.png', 'and-flix-in.png', 'and-pictures-hd-in.png', 'and-pictures-in.png', 'and-prive-hd-in.png', 'and-prive-in.png', 'and-tv-hd-in.png', 'and-tv-in.png', 'apn-news-in.png', 'argus-in.png', 'arihant-in.png', 'asianet-hd-in.png', 'asianet-in.png', 'asianet-movies-in.png', 'asianet-news-in.png', 'asianet-plus-in.png', 'assam-talks-in.png', 'awakening-in.png', 'b4u-bhojpuri-in.png', 'b4u-kadak-in.png', 'b4u-movies-in.png', 'b4u-music-in.png', 'balle-balle-in.png', 'bansal-news-in.png', 'bflix-movies-in.png', 'bharat-samachar-in.png', 'bhojpuri-cinema-in.png', 'big-magic-in.png', 'bindass-in.png', 'box-cinema-in.png', 'calcutta-news-in.png', 'cartoon-network-hd-plus-in.png', 'cartoon-network-in.png', 'channel-win-in.png', 'chardikla-time-tv-in.png', 'cinema-tv-india-in.png', 'cna-channel-news-asia-in.png', 'cnbc-awaaz-in.png', 'cnbc-tv18-in.png', 'cnbc-tv18-prime-hd-in.png', 'cnn-news-18-in.png', 'colors-cineplex-bollywood-in.png', 'colors-cineplex-hd-in.png', 'colors-cineplex-in.png', 'colors-cineplex-superhits-in.png', 'colors-hd-in.png', 'colors-in.png', 'colors-infinity-hd-in.png', 'colors-infinity-in.png', 'colors-marathi-hd-in.png', 'colors-marathi-in.png', 'colors-rishtey-in.png', 'dangal-in.png', 'dd-bharati-in.png', 'dd-bihar-in.png', 'dd-india-hd-in.png', 'dd-india-in.png', 'dd-kisan-in.png', 'dd-madhya-pradesh-in.png', 'dd-national-in.png', 'dd-news-hd-in.png', 'dd-news-in.png', 'dd-rajasthan-in.png', 'dd-retro-in.png', 'dd-sports-in.png', 'dd-uttar-pradesh-in.png', 'dhinchaak-in.png', 'discovery-kids-in.png', 'disha-tv-in.png', 'dishum-in.png', 'divya-in.png', 'e24-in.png', 'enterr10-movies-in.png', 'enterr10-rangeela-in.png', 'epic-in.png', 'et-now-in.png', 'et-now-swadesh-in.png', 'etv-bal-bharat-in.png', 'eurosport-in.png', 'fakt-marathi-in.png', 'filamchi-bhojpuri-in.png', 'first-india-news-rajasthan-in.png', 'food-food-in.png', 'gnt-in.png', 'goodtimes-in.png', 'gubbare-in.png', 'gulistan-news-in.png', 'haryana-beats-in.png', 'hindi-khabar-in.png', 'history-tv18-hd-in.png', 'history-tv18-in.png', 'hungama-in.png', 'ibc-24-in.png', 'india-ahead-in.png', 'india-news-in.png', 'india-news-madhya-pradesh-chhattisgarh-in.png', 'india-news-rajasthan-in.png', 'india-news-uttar-pradesh-in.png', 'india-today-in.png', 'india-tv-in.png', 'india-voice-in.png', 'inh-24x7-in.png', 'insync-in.png', 'ishwar-tv-in.png', 'jai-maharashtra-in.png', 'jalsha-movies-hd-in.png', 'jalsha-movies-in.png', 'jan-tv-in.png', 'jantantra-tv-in.png', 'jinvani-channel-in.png', 'kashish-news-in.png', 'lok-sabha-tv-in.png', 'manoranjan-in.png', 'mastiii-in.png', 'mh-one-in.png', 'mh-one-prime-in.png', 'mh-one-shraddha-in.png', 'mirror-now-in.png', 'mn-plus-hd-in.png', 'mnx-hd-in.png', 'mnx-in.png', 'movies-now-hd-in.png', 'movies-now-in.png', 'mtv-beats-hd-in.png', 'mtv-beats-in.png', 'mtv-hd-plus-in.png', 'mtv-in.png', 'naaptol-in.png', 'ndtv-24x7-in.png', 'ndtv-india-in.png', 'ndtv-prime-in.png', 'ndtv-profit-in.png', 'network-10-in.png', 'news-1-india-in.png', 'news-11-bharat-in.png', 'news-18-bihar-jharkhand-in.png', 'news-18-india-in.png', 'news-18-lokmat-in.png', 'news-18-madhya-pradesh-chhattisgarh-in.png', 'news-18-punjab-haryana-in.png', 'news-18-rajasthan-in.png', 'news-18-urdu-in.png', 'news-18-uttar-pradesh-uttarakhand-in.png', 'news-24-in.png', 'news-24-madhya-pradesh-chhattisgarh-in.png', 'news-india-24x7-in.png', 'news-nation-in.png', 'news-state-in.png', 'news-state-madhya-pradesh-chhattisgarh-in.png', 'news-x-in.png', 'nick-hd-plus-in.png', 'nick-in.png', 'nick-jr-in.png', 'nickelodeon-sonic-in.png', 'oscar-movies-in.png', 'paras-tv-in.png', 'patrika-rajasthan-in.png', 'peace-of-mind-in.png', 'pogo-in.png', 'pravah-picture-in.png', 'prime-news-in.png', 'rajya-sabha-tv-in.png', 'republic-bharat-tv-in.png', 'republic-tv-in.png', 'romedy-now-in.png', 'saam-tv-in.png', 'sadhna-bangla-in.png', 'sadhna-news-madhya-pradesh-chhattisgarh-in.png', 'sadhna-plus-news-in.png', 'salaam-tv-in.png', 'samay-in.png', 'sansad-tv-in.png', 'sanskar-in.png', 'santwani-in.png', 'satsang-tv-in.png', 'sharnam-tv-in.png', 'shemaroo-in.png', 'shemaroo-marathibana-in.png', 'showbox-in.png', 'shubh-tv-in.png', 'sony-aath-in.png', 'sony-bbc-earth-hd-in.png', 'sony-bbc-earth-in.png', 'sony-entertainment-television-hd-in.png', 'sony-entertainment-television-in.png', 'sony-marathi-in.png', 'sony-max-2-hd-in.png', 'sony-max-2-in.png', 'sony-max-hd-in.png', 'sony-max-in.png', 'sony-pal-hd-in.png', 'sony-pal-in.png', 'sony-pix-hd-in.png', 'sony-pix-in.png', 'sony-sab-hd-in.png', 'sony-sab-in.png', 'sony-ten-1-hd-in.png', 'sony-ten-1-in.png', 'sony-ten-2-hd-in.png', 'sony-ten-2-in.png', 'sony-ten-3-hd-in.png', 'sony-ten-3-in.png', 'sony-ten-4-hd-in.png', 'sony-ten-4-in.png', 'sony-ten-5-hd-in.png', 'sony-ten-5-in.png', 'sony-wah-hd-in.png', 'sony-wah-in.png', 'sony-yay-in.png', 'sports-18-in.png', 'star-bharat-hd-in.png', 'star-bharat-in.png', 'star-gold-2-in.png', 'star-gold-hd-in.png', 'star-gold-in.png', 'star-gold-select-hd-in.png', 'star-gold-select-in.png', 'star-jalsha-hd-in.png', 'star-jalsha-in.png', 'star-kiran-in.png', 'star-life-in.png', 'star-maa-gold-in.png', 'star-maa-hd-in.png', 'star-maa-in.png', 'star-maa-movies-hd-in.png', 'star-maa-music-in.png', 'star-movies-hd-in.png', 'star-movies-in.png', 'star-movies-select-hd-in.png', 'star-plus-hd-in.png', 'star-plus-in.png', 'star-pravah-hd-in.png', 'star-pravah-in.png', 'star-sports-1-bangla-in.png', 'star-sports-1-hindi-in.png', 'star-sports-1-in.png', 'star-sports-1-kannada-in.png', 'star-sports-1-marathi-in.png', 'star-sports-1-tamil-in.png', 'star-sports-1-telugu-in.png', 'star-sports-2-in.png', 'star-sports-3-in.png', 'star-sports-first-in.png', 'star-sports-select-1-in.png', 'star-sports-select-2-in.png', 'star-suvarna-hd-in.png', 'star-suvarna-in.png', 'star-suvarna-plus-in.png', 'star-utsav-in.png', 'star-utsav-movies-in.png', 'star-world-hd-in.png', 'star-world-in.png', 'star-world-premiere-hd-in.png', 'subharti.tv-in.png', 'sudarshan-news-in.png', 'super-hungama-in.png', 'swaraj-express-smbc-in.png', 'tata-sky-aradhana-in.png', 'tata-sky-astro-duniya-in.png', 'tata-sky-beauty-in.png', 'tata-sky-cooking-in.png', 'tata-sky-curiosity-channel-in.png', 'tata-sky-english-in-hindi-in.png', 'tata-sky-family-health-in.png', 'tata-sky-fitness-in.png', 'tata-sky-fun-learn-in.png', 'tata-sky-hits-in.png', 'tata-sky-hollywood-local-in.png', 'tata-sky-javed-akhtar-in.png', 'tata-sky-jee-prep-in.png', 'tata-sky-neet-prep-in.png', 'tata-sky-seniors-in.png', 'tata-sky-shortstv-in.png', 'tata-sky-smart-manager-in.png', 'tata-sky-theatre-in.png', 'tata-sky-vedic-maths-in.png', 'tehzeeb-tv-in.png', 'the-q-in.png', 'times-now-in.png', 'times-now-navbharat-in.png', 'times-now-world-in.png', 'total-tv-in.png', 'travelxp-4k-hdr-in.png', 'travelxp-4k-in.png', 'travelxp-hd-in.png', 'travelxp-in.png', 'tv9-bharatvarsh-in.png', 'vedic-in.png', 'vijay-super-in.png', 'vijay-tv-hd-in.png', 'vijay-tv-in.png', 'wion-in.png', 'zee-24-ghanta-in.png', 'zee-24-kalak-in.png', 'zee-24-taas-in.png', 'zee-action-in.png', 'zee-anmol-cinema-in.png', 'zee-bangla-cinema-in.png', 'zee-bangla-hd-in.png', 'zee-bangla-in.png', 'zee-bharat-in.png', 'zee-bihar-jharkhand-in.png', 'zee-biskope-in.png', 'zee-bollywood-in.png', 'zee-business-in.png', 'zee-cafe-hd-in.png', 'zee-cafe-in.png', 'zee-chitramandir-in.png', 'zee-cinema-hd-in.png', 'zee-cinema-in.png', 'zee-cinemalu-hd-in.png', 'zee-cinemalu-in.png', 'zee-classic-in.png', 'zee-delhi-ncr-haryana-in.png', 'zee-ganga-in.png', 'zee-hindustan-in.png', 'zee-jk-ladakh-in.png', 'zee-kannada-hd-in.png', 'zee-kannada-in.png', 'zee-kannada-news-in.png', 'zee-keralam-hd-in.png', 'zee-keralam-in.png', 'zee-madhya-pradesh-chattisgarh-in.png', 'zee-malayalam-news-in.png', 'zee-marathi-hd-in.png', 'zee-marathi-in.png', 'zee-news-hd-in.png', 'zee-news-in.png', 'zee-odisha-news-in.png', 'zee-picchar-hd-in.png', 'zee-picchar-in.png', 'zee-punjab-haryana-himachal-in.png', 'zee-punjabi-in.png', 'zee-rajasthan-in.png', 'zee-sarthak-in.png', 'zee-talkies-hd-in.png', 'zee-talkies-in.png', 'zee-tamil-hd-in.png', 'zee-tamil-in.png', 'zee-tamil-news-in.png', 'zee-telugu-hd-in.png', 'zee-telugu-in.png', 'zee-telugu-news-in.png', 'zee-thirai-hd-in.png', 'zee-thirai-in.png', 'zee-tv-hd-in.png', 'zee-tv-in.png', 'zee-uttar-pradesh-uttarakhand-in.png', 'zee-yuva-in.png', 'zee-zest-hd-in.png', 'zee-zest-in.png', 'zee-zindagi-in.png', 'zing-in.png', 'zoom-in.png'];

const TVLOGOS_INDIA = new Set(TVLOGOS_INDIA_FILES);

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
  'adaptive-streams/refs/heads/main/streams/gb/YuppTV/UtsavBharat.m3u8', // 200 text/plain, not a stream
  // v3.12.72: probed dead — mislabeled Kannada Star relays + dead Ten 4
  '/live/star-sports-1-kannada/index.m3u8', // 404 (probed)
  '/live/star-sports-2-kannada/index.m3u8', // 404 (probed)
  'cloudplay-sonyliv.pages.dev/ten4', // 404 (probed)
  'cdn.buzogezapimuyoku.cc/live/sony-ten-4/index.m3u8' // 404 (probed)
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
  // v3.12.71: Spanish/European league feeds leaking into Sports via iptv-org sports.m3u
  if (/movistar|liga de campeones|deportes|plus\+|gol|teledeporte|liga/.test(name)) return false;
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
    poster: safeLiveLogo(name, raw.logo),
    logo: safeLiveLogo(name, raw.logo),
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

/**
 * v3.12.72: runtime liveness probe. The static dead-list can't keep up with
 * relays that die mid-week; this fetches each channel's manifest on the Live
 * tab load (bounded, cached 30 min) and drops channels whose primary AND all
 * failover players return non-stream responses.
 */
const LIVE_PROBE_CACHE_KEY = 'ajo_live_probe_v1';
const LIVE_PROBE_TTL = 30 * 60 * 1000;
const LIVE_PROBE_CONCURRENCY = 8;

async function probeManifestUrl(url, timeoutMs = 6000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', mode: 'cors' });
    clearTimeout(t);
    if (!res.ok) return false;
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    return ct.includes('mpegurl') || ct.includes('mp4') || ct.includes('octet') || ct.includes('mpeg');
  } catch {
    return false;
  }
}

export async function probeLiveChannels(channels) {
  const out = [...channels];
  const urls = new Set();
  for (const ch of out) {
    for (const p of (ch.players || [])) if (p?.url) urls.add(p.url);
    if (ch.url) urls.add(ch.url);
  }
  let verdicts = {};
  try {
    const raw = localStorage.getItem(LIVE_PROBE_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Date.now() - data.savedAt < LIVE_PROBE_TTL) verdicts = data.verdicts || {};
    }
  } catch {}
  const toProbe = [...urls].filter((u) => !(u in verdicts));
  const queue = [...toProbe];
  const workers = Array.from({ length: LIVE_PROBE_CONCURRENCY }, async () => {
    while (queue.length) {
      const u = queue.shift();
      verdicts[u] = await probeManifestUrl(u);
    }
  });
  await Promise.allSettled(workers);
  try {
    localStorage.setItem(LIVE_PROBE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), verdicts }));
  } catch {}
  return out.filter((ch) => {
    const players = (ch.players && ch.players.length ? ch.players : [{ url: ch.url }]);
    const alive = players.some((p) => {
      const u = p?.url || p;
      const v = verdicts[u];
      return v === undefined ? !isDeadStreamUrl(u) : v;
    });
    return alive;
  });
}
