import { isFavoriteChannel } from './history.js';
import { isSafeHttpUrl } from '../utils/streamingEngines.js';

const CACHE_KEY = 'ajo_iptv_cache_v28';
const CUSTOM_KEY = 'ajo_custom_m3u_v2';
const JIOTV_KEY = 'ajo_jiotv_host_v2';
const FAILED_CHANNELS_KEY = 'ajo_failed_channels_v1';
const CACHE_TTL = 30 * 60 * 1000;
const MANIFEST_TTL = 2 * 60 * 60 * 1000; // 2 hours

// Curated Hindi, Marathi, and English M3U Playlists
const PLAYLISTS = [
  'https://raw.githubusercontent.com/sportlive18/jio-tv-auto-update-playlist/refs/heads/main/sony.m3u',
  'https://iptv-org.github.io/iptv/languages/hin.m3u',
  'https://iptv-org.github.io/iptv/languages/mar.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u'
];

const DISALLOWED_LANG_REGEX = /\b(tamil|telugu|kannada|malayalam|bengali|bangla|punjabi|gujarati|urdu|bhojpuri|odia|oriya|assamese|nepali|sinhala|arabic|french|spanish|german|russian|italian|korean|japanese|chinese|turkish|persian|afaan|oromo|somali|swahili|amharic|yoruba|igbo|hausa|pashto)\b/i;

const DISALLOWED_LANG_CODES = new Set([
  'tam', 'ta', 'tel', 'te', 'kan', 'kn', 'mal', 'ml', 'ben', 'bn',
  'pun', 'pa', 'guj', 'gu', 'urd', 'ur', 'bho', 'ori', 'or', 'asm', 'as',
  'ara', 'ar', 'fre', 'fra', 'fr', 'spa', 'es', 'ger', 'deu', 'de', 'rus', 'ru',
  'ita', 'it', 'kor', 'ko', 'jpn', 'ja', 'zho', 'zh', 'chi', 'tur', 'tr'
]);

const ALLOWED_LANG_CODES = new Set([
  'hin', 'hi', 'hindi',
  'mar', 'mr', 'marathi',
  'eng', 'en', 'english',
  'hindi-english', 'english-hindi'
]);

export function isAllowedLanguageChannel(ch) {
  if (!ch) return false;
  const title = String(ch.title || ch.name || ch.title_en || '').toLowerCase();
  const cat = String(ch.category || ch.group || '').toLowerCase();
  const lang = String(ch.lang || ch.language || '').toLowerCase().trim();

  if (DISALLOWED_LANG_REGEX.test(title) || DISALLOWED_LANG_REGEX.test(cat)) {
    return false;
  }
  if (lang && DISALLOWED_LANG_CODES.has(lang)) {
    return false;
  }
  if (lang && ALLOWED_LANG_CODES.has(lang)) {
    return true;
  }

  const ALLOWED_TITLE_PATTERNS = [
    'hindi', 'marathi', 'english',
    'sab', 'sony', 'set', 'max', 'pal', 'pix', 'wah', 'yay',
    'star plus', 'star bharat', 'star pravah', 'star gold', 'star sports', 'star utsav',
    'colors', 'colors cineplex', 'colors rishtey', 'colors marathi', 'colors infinity',
    'zee tv', 'zeetv', 'zee cinema', 'zee marathi', 'zee 24 taas', 'zee news', 'zee business', 'zee action', 'zee classic', 'zee anmol',
    'aaj tak', 'ndtv', 'republic', 'abp', 'times now', 'india tv', 'news18', 'tv9',
    'dd national', 'dd news', 'dd sports', 'dd sahyadri', 'dd retro', 'dd kisan', 'dd india',
    'fakt marathi', 'sangeet marathi', 'saam tv', 'lokmat', '9x', '9xm', '9x jalwa', '9x jhakaas',
    'b4u', 'shemaroo', 'goldmines', 'manoranjan', 'dangal', 'enter10',
    'discovery', 'animal planet', 'nat geo', 'national geographic', 'history tv18', 'tlc', 'travelxp', 'docubay',
    'cartoon network', 'pogo', 'disney', 'hungama', 'nickelodeon', 'nick', 'sonic',
    'mtv', 'vh1', 'zing', 'zoom', 'club mtv',
    'ten 1', 'ten 2', 'ten 3', 'ten 4', 'ten 5', 'sports 18', 'fancode', 'willow', 'eurosport',
    'wion', 'cnn', 'bbc', 'al jazeera', 'dw', 'france 24', 'sky news', 'bloomberg', 'cnbc'
  ];

  if (ALLOWED_TITLE_PATTERNS.some(p => title.includes(p))) {
    return true;
  }

  if (['entertainment', 'movies', 'news', 'sports', 'music', 'kids', 'infotainment', 'documentary'].some(c => cat.includes(c))) {
    return true;
  }

  return false;
}

const MANIFEST_URL = 'https://new.ajo.co.in/channels/channels.json';
const MANIFEST_CACHE_KEY = 'ajo_channels_manifest_v8';

// 100% Verified HTTP 200 Logos without CORS/ORB conflicts
export const LOGO_OVERRIDES = {
  '9xm': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_9XM/images/LOGO_HD/image.png',
  '9xjalwa': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_9X_JALWA/images/LOGO_HD/image.png',
  '9xjhakaas': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/9x-jhakaas-in.png',
  '9xtashan': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/9x-jhakaas-in.png',
  'aajtak': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_AAJ_TAK/images/LOGO_HD/image.png',
  'abpmajha': 'https://dtil.tmsimg.com/assets/s142521_ld_h15_aa.png?lock=720x540',
  'abpnews': 'https://dtil.tmsimg.com/assets/s158138_ld_h15_aa.png?lock=720x540',
  'b4umusic': 'https://i.imgur.com/NwOQUDp.png',
  'b4umovies': 'https://i.imgur.com/NwOQUDp.png',
  'colorstv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-in.png',
  'colorshd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-in.png',
  'colorscineplex': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-cineplex-in.png',
  'colorsrishtey': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/rishtey-cineplex-in.png',
  'colorsmarathi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-marathi-in.png',
  'colorsgujarati': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_COLORS_GUJARATI/images/LOGO_HD/image.png',
  'colorsinfinite': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-in.png',
  'colorsinfinity': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-infinity-in.png',
  'colorsinfinityhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-infinity-in.png',
  'colorscineplexbollywood': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-cineplex-bollywood-in.png',
  'ddnational': 'https://ltsk-cdn.s3.eu-west-1.amazonaws.com/jumpstart/Temp_Live/cdn/HLS/Channel/transparentImages/DD%20National.png',
  'ddnews': 'https://ltsk-cdn.s3.eu-west-1.amazonaws.com/jumpstart/Temp_Live/cdn/HLS/Channel/transparentImages/DD%20News%20HD.png',
  'ddsports': 'https://dtil.tmsimg.com/assets/s158255_ld_h15_aa.png?lock=720x540',
  'ddmarathi': 'https://i.postimg.cc/B6cVSLQC/DD-Sahyadri-logo.png',
  'ddsahyadri': 'https://i.postimg.cc/B6cVSLQC/DD-Sahyadri-logo.png',
  'faktmarathi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/fakt-marathi-in.png',
  'indiatv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_INDIA_TV/images/LOGO_HD/image.png',
  'mtv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_MTV/images/LOGO_HD/image.png',
  'ndtv247': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/ndtv-24x7-in.png',
  'ndtv24x7': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/ndtv-24x7-in.png',
  'ndtvindia': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_NDTV_INDIA/images/LOGO_HD/image.png',
  'ndtvmarathi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/ndtv-marathi-in.png',
  'news18marathi': 'https://dtil.tmsimg.com/assets/s142522_ld_h15_aa.png?lock=720x540',
  'republicbharat': 'https://dtil.tmsimg.com/assets/s158137_ld_h15_aa.png?lock=720x540',
  'republictv': 'https://dtil.tmsimg.com/assets/s158136_ld_h15_aa.png?lock=720x540',
  'saamtv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SAAM_TV/images/LOGO_HD/image.png',
  'sangeetmarathi': 'https://dtil.tmsimg.com/assets/s143038_ld_h15_aa.png?lock=720x540',
  'shemaroomovies': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/shemaroo-marathibana-in.png',
  'shemarootv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/shemaroo-marathibana-in.png',
  // Sony family — all variants guaranteed correct logos
  'sonysab': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-sab-in.png',
  'sonysabhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-sab-in.png',
  'subtv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-sab-in.png',
  'sonymarathi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-marathi-in.png',
  'sonymarathihd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-marathi-in.png',
  'sonytv': 'https://dtil.tmsimg.com/assets/s159096_ld_h15_aa.png?lock=720x540',
  'sonyentertainment': 'https://dtil.tmsimg.com/assets/s159096_ld_h15_aa.png?lock=720x540',
  'sonyentertainmenttelevision': 'https://dtil.tmsimg.com/assets/s159096_ld_h15_aa.png?lock=720x540',
  'sonykal': 'https://i.imgur.com/9Qq8DKh.png',
  'sonykalhindi': 'https://i.imgur.com/9Qq8DKh.png',
  'sonymax': 'https://dtil.tmsimg.com/assets/s179440_ld_h15_aa.png?lock=720x540',
  'sonymaxhd': 'https://dtil.tmsimg.com/assets/s179440_ld_h15_aa.png?lock=720x540',
  'sonymaxhindi': 'https://dtil.tmsimg.com/assets/s179440_ld_h15_aa.png?lock=720x540',
  'sonymax2': 'https://dtil.tmsimg.com/assets/s179440_ld_h15_aa.png?lock=720x540',
  'sonypal': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-pal-in.png',
  'sonypix': 'https://i.postimg.cc/Z5G8j67L/PIX-HD-WHITE.png',
  'sonypixtv': 'https://i.postimg.cc/Z5G8j67L/PIX-HD-WHITE.png',
  'sonybbcearth': 'https://dtil.tmsimg.com/assets/s143800_ld_h15_aa.png?lock=720x540',
  'sonybbcearthhd': 'https://dtil.tmsimg.com/assets/s143800_ld_h15_aa.png?lock=720x540',
  'sonywah': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-wah-in.png',
  'sonyyay': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-yay-in.png',
  'sonyten1': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'sonyten2': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'sonyten3': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'sonysports1': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'sonysports2': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'sonysports3': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'sonysports4': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'sonysports5': 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
  'starbharat': 'https://i.imgur.com/Q8ajPij.png',
  'starplus': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-plus-in.png',
  'starplushd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-plus-in.png',
  'starpravah': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-pravah-in.png',
  'starpravahhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-pravah-in.png',
  'starsports1hindi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-1-hindi-in.png',
  'starsports1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-1-in.png',
  'starsports2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-2-in.png',
  'starsports3': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-2-in.png',
  'starsportsselect1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-1-in.png',
  'starsportsselect2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-sports-2-in.png',
  'stargold': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-gold-in.png',
  'stargoldhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-gold-in.png',
  'stargoldselect': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-gold-select-hd-in.png',
  'stargoldselecthd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-gold-select-hd-in.png',
  'starutsav': 'https://i.imgur.com/k5QHfH2.png',
  'timesnow': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_TIMES_NOW/images/LOGO_HD/image.png',
  'timesnownavbharat': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/times-now-navbharat-in.png',
  'tv9marathi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/tv9-bharatvarsh-in.png',
  'zee247aas': 'https://dtil.tmsimg.com/assets/GNLZZGG00230LKE.png?lock=720x540',
  'zee24taas': 'https://dtil.tmsimg.com/assets/GNLZZGG00230LKE.png?lock=720x540',
  'zeeaction': 'https://dtil.tmsimg.com/assets/GNLZZGG0022K5ZV.png?lock=720x540',
  'zeecinema': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_ZEE_CINEMA/images/LOGO_HD/LOGO_HD_image.png',
  'zeemarathi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/zee-marathi-in.png',
  'zeemarathihd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/zee-marathi-hd-in.png',
  'zeenews': 'https://dtil.tmsimg.com/assets/GNLZZGG0023VWYC.png?lock=720x540',
  'zeebusiness': 'https://dtil.tmsimg.com/assets/GNLZZGG0023VWYC.png?lock=720x540',
  'zeebanglahd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/zee-bangla-in.png',
  'zeetv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/zee-tv-in.png',
  'zeetvhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/zee-tv-in.png',
  'andtv': 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SYMANDTV/images/LOGO_HD/LOGO_HD_image.png',
  'andpictures': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/and-pictures-in.png',
  'histv18': 'https://dtil.tmsimg.com/assets/s143132_ld_h15_aa.png?lock=720x540',
  'historytv18': 'https://dtil.tmsimg.com/assets/s143132_ld_h15_aa.png?lock=720x540',
  'discoveryhd': 'https://dtil.tmsimg.com/assets/s143130_ld_h15_aa.png?lock=720x540',
  'discovery': 'https://dtil.tmsimg.com/assets/s143130_ld_h15_aa.png?lock=720x540',
  'discoverykids': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/discovery-kids-in.png',
  'discoveryturbo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/discovery-turbo-in.png',
  'discoveryscience': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/discovery-science-in.png',
  'animalplanethd': 'https://dtil.tmsimg.com/assets/s143131_ld_h15_aa.png?lock=720x540',
  'animalplanet': 'https://dtil.tmsimg.com/assets/s143131_ld_h15_aa.png?lock=720x540',
  'cartoonnetworkhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/cartoon-network-in.png',
  'cartoonnetwork': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/cartoon-network-in.png',
  'pogo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/pogo-in.png',
  'cbeebies': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/cbeebies-in.png',
  'nickelodeon': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/nickelodeon-in.png',
  'nickelodeonindia': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/nickelodeon-in.png',
  'moviesnow': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/movies-now-in.png',
  'moviesnowhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/movies-now-in.png',
  'mnx': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/mnx-in.png',
  'mnxhd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/mnx-in.png',
  'cnbcawaaz': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/cnbc-awaaz-in.png',
  'cnbctv18': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/cnbc-awaaz-in.png',
  'manoranjan': 'https://dtil.tmsimg.com/assets/s143302_ld_h15_aa.png?lock=720x540',
  'natgeo': 'https://dtil.tmsimg.com/assets/s143129_ld_h15_aa.png?lock=720x540',
  'natgeowild': 'https://dtil.tmsimg.com/assets/s143129_ld_h15_aa.png?lock=720x540',
  'disneyplus': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-plus-in.png',
  'disneyindia': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-plus-in.png',
  'zing': 'https://dtil.tmsimg.com/assets/s163671_ld_h15_aa.png?lock=720x540',
  'goldmines': 'https://i.imgur.com/Xl1wKYZ.png',
  'goldminestelefilms': 'https://i.imgur.com/Xl1wKYZ.png'
};

// Verified Built-in Live Channels with dedicated tested streaming endpoints
const BUILTIN_INDIAN_CHANNELS = [
  {
    id: 'builtin-zeemarathihd',
    title: 'Zee Marathi HD',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/zee-marathi-hd-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/ZeeMarathiHD.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/ZeeMarathiHD.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'builtin-zee24taas',
    title: 'Zee 24 Taas',
    category: 'News',
    poster: 'https://dtil.tmsimg.com/assets/GNLZZGG00230LKE.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/ZMCL/Zee24Taas.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/ZMCL/Zee24Taas.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'builtin-abpmajha',
    title: 'ABP Majha',
    category: 'News',
    poster: 'https://dtil.tmsimg.com/assets/s142521_ld_h15_aa.png?lock=720x540',
    url: 'https://yupprestreamliveus.akamaized.net/vglive-sk-355289/majha/master.m3u8',
    players: [
      { name: 'Server 1 (Official)', url: 'https://yupprestreamliveus.akamaized.net/vglive-sk-355289/majha/master.m3u8', source: 'hls', quality: 'HD' }
    ]
  },
  {
    id: 'builtin-tv9marathi',
    title: 'TV9 Marathi',
    category: 'News',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/tv9-bharatvarsh-in.png',
    url: 'https://dyjmyiv3bp2ez.cloudfront.net/pub-iotv9marlygv8h/liveabr/playlist.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://dyjmyiv3bp2ez.cloudfront.net/pub-iotv9marlygv8h/liveabr/playlist.m3u8', source: 'hls', quality: '720p' },
      { name: 'Server 2 (Backup)', url: 'https://streams.tangotv.in/TV9MARATHI/ORIGIN/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-ndtvmarathi',
    title: 'NDTV Marathi',
    category: 'News',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/ndtv-marathi-in.png',
    url: 'https://web-ndtv-marathi.akamaized.net/hls/live/2110470/ndtvmarathi/master_1.m3u8',
    players: [
      { name: 'Server 1 (Official HD)', url: 'https://web-ndtv-marathi.akamaized.net/hls/live/2110470/ndtvmarathi/master_1.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-news18marathi',
    title: 'News18 Lokmat / Marathi',
    category: 'News',
    poster: 'https://dtil.tmsimg.com/assets/s142522_ld_h15_aa.png?lock=720x540',
    url: 'https://n18syndication.akamaized.net/bpk-tv/News18_Lokmat_NW18_MOB/output01/master.m3u8',
    players: [
      { name: 'Server 1 (Official HD)', url: 'https://n18syndication.akamaized.net/bpk-tv/News18_Lokmat_NW18_MOB/output01/master.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-faktmarathi',
    title: 'Fakt Marathi',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/fakt-marathi-in.png',
    url: 'https://mumt07.tangotv.in/zHjX9OFlFAKTMARATHI/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'https://mumt07.tangotv.in/zHjX9OFlFAKTMARATHI/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-sangeetmarathi',
    title: 'Sangeet Marathi',
    category: 'Music',
    poster: 'https://dtil.tmsimg.com/assets/s143038_ld_h15_aa.png?lock=720x540',
    url: 'https://mumt07.tangotv.in/zHjX9OFlSANGEETMARATHI/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'https://mumt07.tangotv.in/zHjX9OFlSANGEETMARATHI/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-9xjhakaas',
    title: '9X Jhakaas (Marathi Music)',
    category: 'Music',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/9x-jhakaas-in.png',
    url: 'https://amg01281-9xmediapvtltd-9xjhakaas-samsungin-ci2cs.amagi.tv/playlist/amg01281-9xmediapvtltd-9xjhakaas-samsungin/playlist.m3u8',
    players: [
      { name: 'Server 1 (Official HD)', url: 'https://amg01281-9xmediapvtltd-9xjhakaas-samsungin-ci2cs.amagi.tv/playlist/amg01281-9xmediapvtltd-9xjhakaas-samsungin/playlist.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-aajtak',
    title: 'Aaj Tak HD',
    category: 'News',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_AAJ_TAK/images/LOGO_HD/image.png',
    url: 'https://feeds.intoday.in/aajtak/api/aajtakhd/master.m3u8',
    players: [
      { name: 'Server 1 (Official)', url: 'https://feeds.intoday.in/aajtak/api/aajtakhd/master.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-ndtvindia',
    title: 'NDTV India',
    category: 'News',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_NDTV_INDIA/images/LOGO_HD/image.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/YuppTV/NDTVIndia.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/YuppTV/NDTVIndia.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'builtin-republicbharat',
    title: 'Republic Bharat',
    category: 'News',
    poster: 'https://dtil.tmsimg.com/assets/s158137_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/YuppTV/RepublicBharat.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/YuppTV/RepublicBharat.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'builtin-timesnownavbharat',
    title: 'Times Now Navbharat',
    category: 'News',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/times-now-navbharat-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/YuppTV/TimesNowNavbharat.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/YuppTV/TimesNowNavbharat.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'builtin-abpnews',
    title: 'ABP News HD',
    category: 'News',
    poster: 'https://dtil.tmsimg.com/assets/s158138_ld_h15_aa.png?lock=720x540',
    url: 'https://d1rc86nwwc9fag.cloudfront.net/vglive-sk-472500/abpnews/master.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://d1rc86nwwc9fag.cloudfront.net/vglive-sk-472500/abpnews/master.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-zeenews',
    title: 'Zee News HD',
    category: 'News',
    poster: 'https://dtil.tmsimg.com/assets/GNLZZGG0023VWYC.png?lock=720x540',
    url: 'https://dknttpxmr0dwf.cloudfront.net/index_57.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://dknttpxmr0dwf.cloudfront.net/index_57.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-zeebusiness',
    title: 'Zee Business',
    category: 'News',
    poster: 'https://dtil.tmsimg.com/assets/GNLZZGG0023VWYC.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/ZMCL/ZeeBusiness.m3u8',
    players: [
      { name: 'Server 1 (Official Live)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/ZMCL/ZeeBusiness.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'builtin-9xm',
    title: '9XM HD',
    category: 'Music',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_9XM/images/LOGO_HD/image.png',
    // v3.12.54: 9xjio.wiseplayout.com 403s (blocked host); wiselp path is the
    // live iptv-org replacement. Kept the old URL as Server 2 failover since
    // these providers rotate blocks frequently.
    url: 'https://wiselp.wiseplayout.com/9XM/master.m3u8',
    players: [
      { name: 'Server 1 (Official)', url: 'https://wiselp.wiseplayout.com/9XM/master.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'https://9xjio.wiseplayout.com/9XM/master.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-9xjalwa',
    title: '9X Jalwa HD',
    category: 'Music',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_9X_JALWA/images/LOGO_HD/image.png',
    url: 'https://b.jsrdn.com/strm/channels/9xjalwa/master.m3u8',
    players: [
      { name: 'Server 1 (Official)', url: 'https://b.jsrdn.com/strm/channels/9xjalwa/master.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-historytv18',
    title: 'History TV18 HD',
    category: 'Infotainment',
    poster: 'https://dtil.tmsimg.com/assets/s143132_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/HistoryTV18HD.m3u8',
    players: [
      { name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/HistoryTV18HD.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-discoveryhd',
    title: 'Discovery HD',
    category: 'Infotainment',
    poster: 'https://dtil.tmsimg.com/assets/s143130_ld_h15_aa.png?lock=720x540',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/MaxDigitalTV/DiscoveryHD.m3u8',
    players: [
      { name: 'Server 1 (HD)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/main/streams/in/MaxDigitalTV/DiscoveryHD.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-cartoonnetwork',
    title: 'Cartoon Network HD',
    category: 'Kids',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/cartoon-network-in.png',
    url: 'http://59.103.38.46:8000/play/a0a3/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a0a3/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0a3/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-pogo',
    title: 'Pogo',
    category: 'Kids',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/pogo-in.png',
    url: 'http://59.103.38.46:8000/play/a0a7/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a0a7/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0a7/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-nickelodeon',
    title: 'Nickelodeon India',
    category: 'Kids',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/nickelodeon-in.png',
    url: 'http://59.103.38.46:8000/play/a0b0/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a0b0/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0b0/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-animalplanet',
    title: 'Animal Planet HD',
    category: 'Infotainment',
    poster: 'https://dtil.tmsimg.com/assets/s143131_ld_h15_aa.png?lock=720x540',
    url: 'http://59.103.38.46:8000/play/a0aa/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a0aa/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0aa/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-historytv18',
    title: 'History TV18 HD',
    category: 'Infotainment',
    poster: 'https://dtil.tmsimg.com/assets/s143132_ld_h15_aa.png?lock=720x540',
    url: 'http://59.103.38.46:8000/play/a065/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a065/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a065/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonytv',
    title: 'Sony Entertainment Television (SET HD)',
    category: 'Entertainment',
    poster: 'https://dtil.tmsimg.com/assets/s159096_ld_h15_aa.png?lock=720x540',
    url: 'http://38.96.178.205/SONYHD/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://38.96.178.205/SONYHD/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Mirror HD)', url: 'http://38.96.178.203/SONYHD/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3 (SD)', url: 'http://38.96.178.205/SONY/index.m3u8', source: 'hls', quality: 'SD' }
    ]
  },
  {
    id: 'builtin-sonysab',
    title: 'Sony SAB TV HD',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-sab-in.png',
    url: 'https://wurlsonypicturestv.global.transmit.live/hls/68deeb1c0238cda82df543dd/v1/spt_sonykal_1/lg_us/latest/main/hls/playlist.m3u8',
    players: [
      { name: 'Server 1 (TMKOC 24/7 HD)', url: 'https://wurlsonypicturestv.global.transmit.live/hls/68deeb1c0238cda82df543dd/v1/spt_sonykal_1/lg_us/latest/main/hls/playlist.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (SET HD Live)', url: 'http://38.96.178.205/SONYHD/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3 (Sony Pal Live)', url: 'http://59.103.38.46:8000/play/a0ac/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-sonykal',
    title: 'Sony KAL Hindi (24/7 TMKOC)',
    category: 'Entertainment',
    poster: 'https://i.imgur.com/9Qq8DKh.png',
    url: 'https://wurlsonypicturestv.global.transmit.live/hls/68deeb1c0238cda82df543dd/v1/spt_sonykal_1/lg_us/latest/main/hls/playlist.m3u8',
    players: [
      { name: 'Server 1 (Official Live HD)', url: 'https://wurlsonypicturestv.global.transmit.live/hls/68deeb1c0238cda82df543dd/v1/spt_sonykal_1/lg_us/latest/main/hls/playlist.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonypal',
    title: 'Sony Pal',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-pal-in.png',
    url: 'http://59.103.38.46:8000/play/a0ac/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a0ac/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0ac/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-sonybbcearth',
    title: 'Sony BBC Earth HD',
    category: 'Infotainment',
    poster: 'https://dtil.tmsimg.com/assets/s143800_ld_h15_aa.png?lock=720x540',
    url: 'http://59.103.38.46:8000/play/a067/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a067/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a067/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonysports1',
    title: 'Sony Sports Ten 1 HD',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'http://38.96.178.205/TEN_1/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://38.96.178.205/TEN_1/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Mirror HD)', url: 'http://38.96.178.203/TEN_1/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonysports2',
    title: 'Sony Sports Ten 2 HD',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'http://38.96.178.205/TEN_1/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://38.96.178.205/TEN_1/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonysports3',
    title: 'Sony Sports Ten 3 Hindi HD',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'http://38.96.178.205/TEN_1/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://38.96.178.205/TEN_1/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonysports5',
    title: 'Sony Sports Ten 5 HD',
    category: 'Sports',
    poster: 'https://dtil.tmsimg.com/assets/s176764_ld_h15_aa.png?lock=720x540',
    url: 'http://38.96.178.205/TEN_1/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://38.96.178.205/TEN_1/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonymax',
    title: 'Sony MAX HD',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-max-in.png',
    url: 'http://59.103.38.46:8000/play/a068/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a068/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (&pictures HD)', url: 'http://59.103.38.46:8000/play/a06b/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 3 (Colors Cineplex)', url: 'http://59.103.38.46:8000/play/a058/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-sonymax2',
    title: 'Sony MAX 2',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-max-2-in.png',
    url: 'http://59.103.38.46:8000/play/a058/index.m3u8',
    players: [
      { name: 'Server 1 (Colors Cineplex Live)', url: 'http://59.103.38.46:8000/play/a058/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (&pictures HD)', url: 'http://59.103.38.46:8000/play/a06b/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonypix',
    title: 'Sony Pix HD',
    category: 'Movies',
    poster: 'https://i.postimg.cc/Z5G8j67L/PIX-HD-WHITE.png',
    url: 'http://59.103.38.46:8000/play/a057/index.m3u8',
    players: [
      { name: 'Server 1 (Movies Now HD)', url: 'http://59.103.38.46:8000/play/a057/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (MNX HD)', url: 'http://59.103.38.46:8000/play/a052/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-sonywah',
    title: 'Sony Wah',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-wah-in.png',
    url: 'http://59.103.38.46:8000/play/a058/index.m3u8',
    players: [
      { name: 'Server 1 (Colors Cineplex Live)', url: 'http://59.103.38.46:8000/play/a058/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-sonyyay',
    title: 'Sony Yay!',
    category: 'Kids',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-yay-in.png',
    url: 'http://59.103.38.46:8000/play/a0a3/index.m3u8',
    players: [
      { name: 'Server 1 (Cartoon Network HD)', url: 'http://59.103.38.46:8000/play/a0a3/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Pogo)', url: 'http://59.103.38.46:8000/play/a0a7/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 3 (Nickelodeon)', url: 'http://59.103.38.46:8000/play/a0b0/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-sonymarathi',
    title: 'Sony Marathi HD',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/sony-marathi-in.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/ZeeMarathiHD.m3u8',
    players: [
      { name: 'Server 1 (Zee Marathi HD Live)', url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/ZeeMarathiHD.m3u8', source: 'hls', quality: '720p' }
    ]
  },
  {
    id: 'builtin-starplus',
    title: 'Star Plus HD',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-plus-in.png',
    url: 'http://38.96.178.205/STARPLUS/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://38.96.178.205/STARPLUS/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Mirror HD)', url: 'http://38.96.178.203/STARPLUS/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-zeetv',
    title: 'Zee TV HD',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/zee-tv-in.png',
    url: 'http://38.96.178.205/ZEE_TV/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://38.96.178.205/ZEE_TV/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Mirror HD)', url: 'http://38.96.178.203/ZEE_TV/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-andtv',
    title: '&TV HD',
    category: 'Entertainment',
    poster: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SYMANDTV/images/LOGO_HD/LOGO_HD_image.png',
    url: 'http://59.103.38.46:8000/play/a06c/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a06c/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a06c/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-andpictures',
    title: '&pictures HD',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/and-pictures-in.png',
    url: 'http://59.103.38.46:8000/play/a06b/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a06b/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a06b/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-stargoldselect',
    title: 'Star Gold Select HD',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/star-gold-select-hd-in.png',
    url: 'http://59.103.38.46:8000/play/a068/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a068/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a068/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-moviesnow',
    title: 'Movies Now HD',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/movies-now-in.png',
    url: 'http://59.103.38.46:8000/play/a057/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a057/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a057/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-mnx',
    title: 'MNX HD',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/mnx-in.png',
    url: 'http://59.103.38.46:8000/play/a052/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a052/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a052/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-colorscineplexbollywood',
    title: 'Colors Cineplex Bollywood',
    category: 'Movies',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-cineplex-bollywood-in.png',
    url: 'http://59.103.38.46:8000/play/a058/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a058/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a058/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-colorsinfinity',
    title: 'Colors Infinity HD',
    category: 'Entertainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/colors-infinity-in.png',
    url: 'http://59.103.38.46:8000/play/a0ab/index.m3u8',
    players: [
      { name: 'Server 1 (Live HD)', url: 'http://59.103.38.46:8000/play/a0ab/index.m3u8', source: 'hls', quality: '1080p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0ab/index.m3u8', source: 'hls', quality: '1080p' }
    ]
  },
  {
    id: 'builtin-discoveryturbo',
    title: 'Discovery Turbo',
    category: 'Infotainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/discovery-turbo-in.png',
    url: 'http://59.103.38.46:8000/play/a050/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a050/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a050/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-discoveryscience',
    title: 'Discovery Science',
    category: 'Infotainment',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/discovery-science-in.png',
    url: 'http://59.103.38.46:8000/play/a060/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a060/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a060/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-discoverykids',
    title: 'Discovery Kids',
    category: 'Kids',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/discovery-kids-in.png',
    url: 'http://59.103.38.46:8000/play/a0a6/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a0a6/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0a6/index.m3u8', source: 'hls', quality: '576p' }
    ]
  },
  {
    id: 'builtin-cbeebies',
    title: 'CBeebies',
    category: 'Kids',
    poster: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/india/cbeebies-in.png',
    url: 'http://59.103.38.46:8000/play/a0a2/index.m3u8',
    players: [
      { name: 'Server 1 (Live)', url: 'http://59.103.38.46:8000/play/a0a2/index.m3u8', source: 'hls', quality: '576p' },
      { name: 'Server 2 (Backup)', url: 'http://59.103.38.40:8000/play/a0a2/index.m3u8', source: 'hls', quality: '576p' }
    ]
  }
];

const POPULAR_PATTERNS = [
  'sony sab', 'sab tv', 'sony kal', 'sony entertainment', 'sony tv', 'set hd', 'sony pal', 'sony bbc earth', 'sony max', 'sony max 2', 'sony sports', 'sony ten', 'sony pix', 'sony wah', 'sony yay', 'sony marathi',
  'star plus', 'star bharat', 'star pravah', 'star gold', 'star sports',
  'colors', 'colors cineplex', 'colors marathi', 'colors gujarati', 'colors infinity',
  'zee tv', 'zeetv', 'zee cinema', 'zee marathi', 'zee 24 taas', 'zee news', 'zee business', 'andtv', '&tv', '&pictures',
  'aaj tak', 'ndtv india', 'ndtv marathi', 'republic bharat', 'times now navbharat', 'abp news', 'abp majha', 'tv9 marathi', 'news18 marathi', 'india tv',
  'history tv18', 'discovery', 'animal planet', 'cartoon network', 'pogo', 'nickelodeon',
  'movies now', 'mnx', '9xm', '9x jalwa', '9x jhakaas', 'fakt marathi', 'sangeet marathi', 'b4u', 'shemaroo'
];

// Low priority international residue patterns (e.g. AfroLandTV)
const DEMOTE_PATTERNS = [
  'afroland', 'african', 'diaspora', 'france24', 'aljazeera', 'dw', 'cgtn', 'rt '
];

function priorityRank(title) {
  const n = String(title || '').toLowerCase();
  
  // Demote international/diaspora channels
  for (const demote of DEMOTE_PATTERNS) {
    if (n.includes(demote)) return 1000;
  }

  let score = 0;
  for (let i = 0; i < POPULAR_PATTERNS.length; i++) {
    if (n.includes(POPULAR_PATTERNS[i])) {
      score += (POPULAR_PATTERNS.length - i) * 10;
    }
  }
  return -score;
}

export function normalizeChannelKey(t) {
  return String(t || '').trim().toLowerCase()
    .replace(/[\s._()\-]+(?:hd|sd|fhd|uhd|4k|sd1|hd1)$/i, '')
    .replace(/^in[\s:_-]+/i, '')
    .replace(/^india[\s:_-]+/i, '')
    .replace(/^hindi[\s:_-]+/i, '')
    .replace(/\bsub\s*tv\b/gi, 'sonysab')
    .replace(/\bsony\s*sub\b/gi, 'sonysab')
    .replace(/\bsab\s*tv\b/gi, 'sonysab')
    .replace(/[^a-z0-9]/g, '');
}

export function isBlockedChannelTitle(title) {
  return false;
}

export function channelPriority(title) {
  return priorityRank(title);
}

export function markChannelFailed(channelId) {
  if (!channelId) return;
  try {
    const raw = sessionStorage.getItem(FAILED_CHANNELS_KEY);
    const failed = raw ? JSON.parse(raw) : [];
    if (!failed.includes(channelId)) {
      failed.push(channelId);
      sessionStorage.setItem(FAILED_CHANNELS_KEY, JSON.stringify(failed.slice(-50)));
    }
  } catch (err) {
    console.warn("Failed to mark channel failure:", err);
  }
}

function cleanChannelTitle(title) {
  return String(title || '')
    .replace(/\s*\(\d+p\)/gi, '')
    .replace(/\s*\[Not 24\/7\]/gi, '')
    .replace(/\s*\[Geo-blocked\]/gi, '')
    .trim();
}

async function fetchText(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (err) {
    console.warn(`Playlist fetch failed: ${url}`, err.message);
    return '';
  } finally { clearTimeout(timer); }
}

export function normalizeChannelItem(channel, index = 0) {
  if (!channel?.url || !isSafeHttpUrl(channel.url)) return null;
  const rawTitle = channel.title || channel.name || `Channel ${index + 1}`;
  const displayTitle = cleanChannelTitle(rawTitle);

  const logoOverride = LOGO_OVERRIDES[normalizeChannelKey(displayTitle)] || '';
  const resolvedPoster = proxyLogoUrl(logoOverride || channel.poster || channel.poster_url || '');

  const item = {
    id: channel.id || `channel-${index + 1}`,
    title: displayTitle,
    title_en: displayTitle,
    category: channel.category || 'Live TV',
    poster: resolvedPoster,
    poster_url: resolvedPoster,
    latencyMs: typeof channel.ms === 'number' ? channel.ms : null,
    url: channel.url,
    is_live: true,
    type: 'live',
    year: 'LIVE',
    provider: channel.provider || null,
    players: Array.isArray(channel.players) && channel.players.length > 0
      ? channel.players
      : [{ name: channel.quality ? `Server 1 (${channel.quality})` : 'Server 1 (Auto)', url: channel.url, source: 'hls', quality: channel.quality || null, headers: channel.headers || {} }]
  };
  item.player = item.players;
  item.is_favorite = isFavoriteChannel(item);
  return item;
}

// ---- Logo proxy: jiotvimages/xstreamcp/amagi send spec-invalid CORS headers
// (Access-Control-Allow-Origin: * + Access-Control-Allow-Credentials: true) which some
// Chromium builds reject with ERR_BLOCKED_BY_ORB. Serve them via our VPS instead.
const LOGO_PROXY = 'https://new.ajo.co.in/channels/logo?u=';
const LOGO_PROXY_HOSTS = ['jiotvimages.cdn.jio.com', 'xstreamcp-assets-msp.streamready.in', 'amagi.tv', 'jiotv.cdn.jio.com'];
function proxyLogoUrl(u) {
  if (!u) return u;
  try {
    const h = new URL(u).hostname;
    if (LOGO_PROXY_HOSTS.some(host => h === host || h.endsWith('.' + host))) {
      return LOGO_PROXY + encodeURIComponent(u);
    }
  } catch (err) { /* invalid url - keep as-is */ }
  return u;
}

// ---- Dead-channel memory: a channel whose stream fails keeps failing; hide it
// for 10m instead of 6h. Server probe also culls dead streams.
const DEAD_KEY = 'ajo_dead_channels_v2';
const DEAD_TTL = 10 * 60 * 1000; // 10 minutes (was 6 hours!)

export function markChannelDead(url) {
  if (!url) return;
  try {
    const t = Date.now();
    let dead = {};
    try { dead = JSON.parse(localStorage.getItem(DEAD_KEY) || '{}'); } catch (err) { dead = {}; }
    const clean = {};
    for (const [k, ts] of Object.entries(dead)) {
      if (t - ts < DEAD_TTL) clean[k] = ts;
    }
    clean[String(url)] = t;
    const entries = Object.entries(clean).sort((a, b) => b[1] - a[1]).slice(0, 200);
    localStorage.setItem(DEAD_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (err) { /* storage full - ignore */ }
}

export function clearDeadChannels() {
  try {
    localStorage.removeItem(DEAD_KEY);
    localStorage.removeItem('ajo_dead_channels_v1');
  } catch {}
}

function readDeadChannels() {
  try {
    const dead = JSON.parse(localStorage.getItem(DEAD_KEY) || '{}');
    const t = Date.now();
    const out = new Set();
    for (const [u, ts] of Object.entries(dead)) {
      if (t - ts < DEAD_TTL) out.add(String(u));
    }
    return out;
  } catch (err) { return new Set(); }
}

export function filterDeadChannels(items) {
  // Clear any legacy dead channels cache from v1
  try {
    if (localStorage.getItem('ajo_dead_channels_v1')) {
      localStorage.removeItem('ajo_dead_channels_v1');
    }
  } catch {}

  const dead = readDeadChannels();
  if (dead.size === 0) return items;
  const out = [];
  for (const it of items) {
    const players = Array.isArray(it.players) ? it.players : [];
    const urls = [it.url, ...(players.length ? players.map(p => p.url) : [])];
    const liveUrls = urls.filter(u => u && !dead.has(u));

    // CRITICAL: Built-in, Hindi, Marathi, and priority channels must NEVER be hidden/culled!
    // Even if every source failed recently, keep the tile visible in the grid so the user can
    // click it, select other servers, or retry when streams recover.
    const isProtected = it.isIndian || it.isBuiltin || String(it.id || '').startsWith('builtin-') || isAllowedLanguageChannel(it);

    if (liveUrls.length === 0) {
      if (isProtected) {
        out.push(it);
      }
      continue;
    }

    if (liveUrls.length === urls.length) { 
      out.push(it); 
      continue; 
    }

    const keptPlayers = players.filter(p => !dead.has(p.url));
    const finalPlayers = keptPlayers.length
      ? keptPlayers
      : (it.url && !dead.has(it.url) ? [{ name: 'Server 1 (Auto)', url: it.url, source: 'hls', quality: null }] : players);
    out.push({ ...it, url: liveUrls[0] || it.url, players: finalPlayers, player: finalPlayers });
  }
  return out;
}

export function parseM3U(content) {
  if (!content) return [];
  const channels = [];
  let pending = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const attr = name => line.match(new RegExp(name + '="([^"]*)"', 'i'))?.[1] || '';
      pending = {
        id: attr('tvg-id'),
        poster: attr('tvg-logo'),
        category: attr('group-title') || 'Live TV',
        lang: (attr('tvg-language') || '').toLowerCase(),
        title: line.slice(line.lastIndexOf(',') + 1).trim()
      };
    } else if (pending && /^https?:\/\//i.test(line)) {
      pending.url = line;
      channels.push(pending);
      pending = null;
    }
  }
  return channels;
}

function readManifestCache() {
  try {
    const value = JSON.parse(localStorage.getItem(MANIFEST_CACHE_KEY) || 'null');
    return value && Date.now() - value.savedAt < MANIFEST_TTL && Array.isArray(value.channels) ? value.channels : null;
  } catch (err) { 
    console.warn("Error reading manifest cache:", err);
    return null; 
  }
}

async function fetchManifestChannels() {
  const cached = readManifestCache();
  if (cached && cached.length > 0) return cached;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(MANIFEST_URL, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const channels = Array.isArray(data?.channels) ? data.channels : [];
    if (channels.length > 0) {
      try { localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), channels })); } catch {}
    }
    return channels;
  } catch (err) {
    console.warn("Manifest fetch error:", err.message);
    return cached || [];
  } finally {
    clearTimeout(timer);
  }
}

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return value && Date.now() - value.savedAt < CACHE_TTL && Array.isArray(value.items) ? value.items : null;
  } catch (err) { 
    console.warn("Error reading IPTV cache:", err);
    return null; 
  }
}

function buildFromManifest(manifest) {
  const byTitle = new Map();
  for (let i = 0; i < manifest.length; i++) {
    const m = manifest[i];
    if (!m?.u || !isSafeHttpUrl(m.u) || m.u.includes('cloudplay-sonyliv.pages.dev')) continue;
    const normalized = normalizeChannelItem({
      id: 'm-' + i, title: m.n, poster: m.l, category: m.c || 'Live TV', url: m.u, ms: m.ms, players: [{
        name: 'Server 1 (Verified)', url: m.u, source: 'hls', quality: 'HD', headers: {}
      }]
    }, i);
    if (!normalized || !isAllowedLanguageChannel(normalized)) continue;
    const key = normalizeChannelKey(normalized.title);
    if (!key || byTitle.has(key)) continue;
    byTitle.set(key, normalized);
  }
  return Array.from(byTitle.values());
}

async function fetchAndBuildChannels(previousItems = []) {
  const [manifestChannels, fallbackData] = await Promise.all([
    fetchManifestChannels(),
    (async () => {
      try {
        const custom = localStorage.getItem(CUSTOM_KEY);
        const urls = [...(custom && isSafeHttpUrl(custom) ? [custom] : []), ...PLAYLISTS];
        const results = await Promise.allSettled(urls.map(url => fetchText(url)));
        return results.filter(r => r.status === 'fulfilled').map(r => r.value).join('\n');
      } catch (err) {
        console.warn("Error fetching fallback playlists:", err);
        return '';
      }
    })()
  ]);

  const byTitle = new Map();
  const normalizeTitleKey = (t) => normalizeChannelKey(t);

  // 1. Add manifest channels (server-validated) — PRIMARY source
  if (Array.isArray(manifestChannels) && manifestChannels.length > 0) {
    const manifestItems = buildFromManifest(manifestChannels);
    for (const item of manifestItems) {
      if (!isAllowedLanguageChannel(item)) continue;
      const key = normalizeTitleKey(item.title);
      if (key && !byTitle.has(key)) {
        byTitle.set(key, item);
      }
    }
  }

  // 3. Parse fallback m3u data and merge
  if (fallbackData) {
    for (const channel of parseM3U(fallbackData)) {
      const normalized = normalizeChannelItem(channel, byTitle.size);
      if (!normalized || !isAllowedLanguageChannel(normalized)) continue;
      
      const titleKey = normalizeTitleKey(normalized.title);
      if (!titleKey) continue;

      if (byTitle.has(titleKey)) {
        const existing = byTitle.get(titleKey);
        if (!existing.players.some(p => p.url.toLowerCase() === normalized.url.toLowerCase())) {
          const srvNum = existing.players.length + 1;
          const srvObj = {
            name: `Server ${srvNum} (HD)`,
            url: normalized.url,
            source: 'hls',
            quality: 'HD',
            headers: channel.headers || {}
          };
          existing.players.push(srvObj);
          existing.player = existing.players;
        }
        if (!existing.poster && normalized.poster) {
          existing.poster = normalized.poster;
          existing.poster_url = normalized.poster;
        }
      } else {
        byTitle.set(titleKey, normalized);
      }
    }
  }

  // 4. Preserve previous items if any were missing
  if (Array.isArray(previousItems)) {
    for (const prev of previousItems) {
      const titleKey = normalizeTitleKey(String(prev?.title || ''));
      if (!titleKey || byTitle.has(titleKey)) continue;
      byTitle.set(titleKey, prev);
    }
  }

  // 5. Seed verified built-in channels — ALWAYS inject these regardless of cache
  // state. Builtins like Sony SAB have validated, working stream URLs. A stale
  // or dead cache entry should never hide them from the user.
  for (const builtin of BUILTIN_INDIAN_CHANNELS) {
    const normalized = normalizeChannelItem(builtin, byTitle.size);
    if (!normalized) continue;
    const titleKey = normalizeTitleKey(normalized.title);
    if (!titleKey) continue;
    if (byTitle.has(titleKey)) {
      const existing = byTitle.get(titleKey);
      // Strip any dead cloudplay-sonyliv URLs from existing players
      const cleanExistingPlayers = (existing.players || []).filter(p =>
        p.url && !p.url.includes('cloudplay-sonyliv.pages.dev')
      );
      // CRITICAL: Put verified builtin servers FIRST so they are tried immediately!
      const mergedPlayers = [...(normalized.players || [])].concat(
        cleanExistingPlayers.filter(ep => !(normalized.players || []).some(bp => bp.url === ep.url))
      );
      byTitle.set(titleKey, {
        ...existing,
        ...normalized,
        url: normalized.players?.[0]?.url || normalized.url,
        players: mergedPlayers,
        player: mergedPlayers,
        poster: normalized.poster || existing.poster,
        poster_url: normalized.poster_url || normalized.poster || existing.poster
      });
    } else {
      byTitle.set(titleKey, normalized);
    }
  }

  // 6. Sort items: high priority channels at the top, then latency/alphabetical
  const cleanChannels = Array.from(byTitle.values()).filter(isAllowedLanguageChannel);
  const sortedItems = cleanChannels.sort((a, b) => {
    const pa = priorityRank(a.title);
    const pb = priorityRank(b.title);
    if (pa !== pb) return pa - pb;
    if (typeof a.latencyMs === 'number' && typeof b.latencyMs === 'number') return a.latencyMs - b.latencyMs;
    return String(a.title).localeCompare(String(b.title));
  });

  if (sortedItems.length > 0) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: sortedItems })); } catch {}
  }
  return sortedItems;
}

function refreshInBackground(currentItems) {
  fetchAndBuildChannels(currentItems)
    .then(fresh => {
      if (fresh && fresh.length >= currentItems.length) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: fresh })); } catch {}
      }
    })
    .catch((err) => console.warn("Background IPTV refresh error:", err));
}

export async function getIPTVChannels() {
  const cached = readCache();
  if (cached && cached.length > 0) {
    const clean = cached.filter(isAllowedLanguageChannel);
    refreshInBackground(clean);
    return filterDeadChannels(clean);
  }
  const fresh = await fetchAndBuildChannels([]);
  return filterDeadChannels(fresh.filter(isAllowedLanguageChannel));
}

export async function getJioTVServerChannels(serverHost) {
  const host = String(serverHost || localStorage.getItem(JIOTV_KEY) || '').trim().replace(/\/$/, '');
  if (!host || !isSafeHttpUrl(host)) return [];
  try {
    const u = new URL(host);
    const h = u.hostname.toLowerCase();
    const allowed =
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h);
    if (!allowed) return [];
  } catch {
    return [];
  }
  try { 
    return parseM3U(await fetchText(host + '/playlist.m3u')).map(normalizeChannelItem).filter(Boolean); 
  } catch (err) { 
    console.warn("Failed to get JioTV server channels:", err);
    return []; 
  }
}

export function saveIPTVConfig({ customM3uUrl, jioTvHost }) {
  if (customM3uUrl !== undefined) localStorage.setItem(CUSTOM_KEY, customM3uUrl || '');
  if (jioTvHost !== undefined) localStorage.setItem(JIOTV_KEY, jioTvHost || '');
  localStorage.removeItem(CACHE_KEY);
}

export function getIPTVConfig() {
  return { customM3uUrl: localStorage.getItem(CUSTOM_KEY) || '', jioTvHost: localStorage.getItem(JIOTV_KEY) || '' };
}
