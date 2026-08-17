/**
 * Ultra-Lightweight, Blazing Fast Curated Live TV Channel Engine
 * Optimized for Mobile & Cross-Device Cast: Instant startup, zero memory bloat, reliable HD streams.
 */
import { getFavoriteChannels, isFavoriteChannel } from './history.js';

export const CURATED_HD_CHANNELS = [
  // ================= 1. LIVE CRICKET & GLOBAL SPORTS =================
  {
    id: 'sports_star1_hd',
    title: 'Star Sports 1 HD (Hindi/English)',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/21/eb19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/3.m3u8',
    quality: '1080p 50fps',
    badge: 'HD Live'
  },
  {
    id: 'sports_star2_hd',
    title: 'Star Sports 2 HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/2/ef92782f8c961905fd83bbd9987c987c.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/1.m3u8',
    quality: '1080p HD',
    badge: 'HD Live'
  },
  {
    id: 'sports_star_select1',
    title: 'Star Sports Select 1 HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/5/2e68185bbe22aa968f98dc6fa082a97e.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/4.m3u8',
    quality: '1080p HD',
    badge: 'Premier League'
  },
  {
    id: 'sports_star_select2',
    title: 'Star Sports Select 2 HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/1/4242f1d69a97fe9cde15e94bc132d45d.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/5.m3u8',
    quality: '1080p HD',
    badge: 'Live Sports'
  },
  {
    id: 'sports_sony_ten1',
    title: 'Sony Sports Ten 1 HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/12/4ee3f4e5f806e1fba4b0bdd3cf08fc4d.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/6.m3u8',
    quality: '1080p HD',
    badge: 'WWE & Champions League'
  },
  {
    id: 'sports_sony_ten2',
    title: 'Sony Sports Ten 2 HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/13/21f8a846167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/7.m3u8',
    quality: '1080p HD',
    badge: 'Football HD'
  },
  {
    id: 'sports_sony_ten3',
    title: 'Sony Sports Ten 3 HD (Hindi)',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/14/c128a846167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/8.m3u8',
    quality: '1080p HD',
    badge: 'WWE Hindi'
  },
  {
    id: 'sports_sony_ten5',
    title: 'Sony Sports Ten 5 HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/15/d448a846167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/9.m3u8',
    quality: '1080p HD',
    badge: 'Live Sports'
  },
  {
    id: 'sports_fancode',
    title: 'Fancode Sports HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/3/6e46756c390d8f91ab63932e600091ea.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/2.m3u8',
    quality: '1080p HD',
    badge: 'Live Cricket'
  },
  {
    id: 'sports_sports18_1',
    title: 'Sports18 1 HD',
    category: 'Sports',
    poster: 'https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F5%2F5c%2FSports18_1_HD_logo.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/13.m3u8',
    quality: '1080p HD',
    badge: 'IPL / WPL'
  },
  {
    id: 'sports_sports18_khel',
    title: 'Sports18 Khel HD',
    category: 'Sports',
    poster: 'https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F5%2F5c%2FSports18_1_HD_logo.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/14.m3u8',
    quality: '1080p HD',
    badge: 'Free Sports'
  },
  {
    id: 'sports_willow_cricket',
    title: 'Willow Cricket HD',
    category: 'Sports',
    poster: 'https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fen%2F3%2F39%2FWillow_TV_logo.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/12.m3u8',
    quality: '1080p HD',
    badge: '24/7 Cricket'
  },
  {
    id: 'sports_willow_sports',
    title: 'Willow Sports HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/17/026e134cc1d66aee9dd5b95373598c9e.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/11.m3u8',
    quality: '1080p HD',
    badge: 'Cricket Live'
  },
  {
    id: 'sports_premier_sports',
    title: 'Premier Sports HD',
    category: 'Sports',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/16/e724a32ea2d1f454ad80a8a5a57bade6.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/10.m3u8',
    quality: '1080p HD',
    badge: 'Football & Boxing'
  },

  // ================= 2. POPULAR ENTERTAINMENT & SERIALS =================
  {
    id: 'ent_star_plus_hd',
    title: 'Star Plus HD',
    category: 'Entertainment',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/1/eb19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/15.m3u8',
    quality: '1080p HD',
    badge: 'Top Drama'
  },
  {
    id: 'ent_colors_hd',
    title: 'Colors TV HD',
    category: 'Entertainment',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/7/7b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/16.m3u8',
    quality: '1080p HD',
    badge: 'Bigg Boss'
  },
  {
    id: 'ent_sony_tv_hd',
    title: 'Sony Entertainment Television HD',
    category: 'Entertainment',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/3/3b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/17.m3u8',
    quality: '1080p HD',
    badge: 'KBC & Shows'
  },
  {
    id: 'ent_zee_tv_hd',
    title: 'Zee TV HD',
    category: 'Entertainment',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/6/6b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/18.m3u8',
    quality: '1080p HD',
    badge: 'Serials'
  },
  {
    id: 'ent_star_bharat',
    title: 'Star Bharat HD',
    category: 'Entertainment',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/8/8b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/19.m3u8',
    quality: '1080p HD',
    badge: 'Mythology & Drama'
  },
  {
    id: 'ent_dd_national',
    title: 'DD National HD',
    category: 'Entertainment',
    poster: 'https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F8%2F8f%2FDD_National_logo_2023.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/42.m3u8',
    quality: '1080p HD',
    badge: 'National TV'
  },

  // ================= 3. 24/7 MOVIES & CINEMA =================
  {
    id: 'mov_star_gold_hd',
    title: 'Star Gold HD',
    category: 'Movies',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/16/16b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/23.m3u8',
    quality: '1080p HD',
    badge: 'Blockbusters'
  },
  {
    id: 'mov_sony_max_hd',
    title: 'Sony MAX HD',
    category: 'Movies',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/17/17b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/21.m3u8',
    quality: '1080p HD',
    badge: 'Sooryavansham & Hits'
  },
  {
    id: 'mov_zee_cinema_hd',
    title: 'Zee Cinema HD',
    category: 'Movies',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/18/18b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/20.m3u8',
    quality: '1080p HD',
    badge: 'Cinema Hall'
  },
  {
    id: 'mov_colors_cineplex',
    title: 'Colors Cineplex HD',
    category: 'Movies',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/19/19b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/24.m3u8',
    quality: '1080p HD',
    badge: 'South Hindi Dubbed'
  },
  {
    id: 'mov_andpictures',
    title: '&pictures HD',
    category: 'Movies',
    poster: 'https://img.elochkaigolochla.com/340-500/Images/Broadcasts/Poster/20/20b19a8f6167539822f1df27848fff91b.jpg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/22.m3u8',
    quality: '1080p HD',
    badge: 'Premieres'
  },

  // ================= 4. LIVE NEWS CHANNELS =================
  {
    id: 'news_aaj_tak_hd',
    title: 'Aaj Tak HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Aaj_tak_logo.png',
    url: 'https://feeds.intoday.in/aajtak/api/aajtakhd/master.m3u8',
    quality: '1080p HD',
    badge: '#1 Hindi News'
  },
  {
    id: 'news_abp_news',
    title: 'ABP News HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/6/61/ABP_News_logo.png',
    url: 'https://d2l4ar6y3mrs4k.cloudfront.net/live-streaming/abpnews-livetv/master.m3u8',
    quality: '1080p HD',
    badge: 'Hindi News'
  },
  {
    id: 'news_india_tv',
    title: 'India TV HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/India_TV_logo.png',
    url: 'https://pl-indiatvnews.akamaized.net/out/v1/db79179b608641ceaa5a4d0dd0dca8da/index.m3u8',
    quality: '1080p HD',
    badge: 'Aap Ki Adalat'
  },
  {
    id: 'news_ndtv_india',
    title: 'NDTV India HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/8/81/NDTV_India_logo.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/NDTVIndia.m3u8',
    quality: '1080p HD',
    badge: 'Prime Time'
  },
  {
    id: 'news_ndtv_247',
    title: 'NDTV 24x7 HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/6/69/NDTV_24x7_logo.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/NDTV24x7.m3u8',
    quality: '1080p HD',
    badge: 'English News'
  },
  {
    id: 'news_news18_india',
    title: 'News18 India HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/News18_India_logo.svg/1200px-News18_India_logo.svg.png',
    url: 'https://n18syndication.akamaized.net/bpk-tv/News18_India_NW18_MOB/output01/master.m3u8',
    quality: '1080p HD',
    badge: 'Desh Ka Dum'
  },
  {
    id: 'news_zee_news',
    title: 'Zee News HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Zee_News_logo_2023.svg/1200px-Zee_News_logo_2023.svg.png',
    url: 'https://zeenews.akamaized.net/hls/live/2014499/zeenews/master.m3u8',
    quality: '1080p HD',
    badge: 'DNA & Headlines'
  },
  {
    id: 'news_republic_bharat',
    title: 'Republic Bharat HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/en/0/03/Republic_Bharat_Logo.png',
    url: 'https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/RepublicBharat.m3u8',
    quality: '1080p HD',
    badge: 'Rashtrahit'
  },
  {
    id: 'news_bbc_world',
    title: 'BBC World News HD',
    category: 'News',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/BBC_News_2022.svg/1200px-BBC_News_2022.svg.png',
    url: 'https://vs-hls-push-ww-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/t=3840/v=pv14/b=5070016/main.m3u8',
    quality: '1080p HD',
    badge: 'Global World'
  },

  // ================= 5. KIDS & ANIMATION =================
  {
    id: 'kids_cartoon_network',
    title: 'Cartoon Network HD (Hindi)',
    category: 'Kids',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/8/80/Cartoon_Network_2010_logo.svg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/29.m3u8',
    quality: '1080p HD',
    badge: 'Ben 10 & Tom and Jerry'
  },
  {
    id: 'kids_disney_channel',
    title: 'Disney Channel HD',
    category: 'Kids',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Disney_Channel_logo.svg',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/32.m3u8',
    quality: '1080p HD',
    badge: 'Doraemon & Shinchan'
  },
  {
    id: 'kids_pogo',
    title: 'Pogo TV HD',
    category: 'Kids',
    poster: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/57/Pogo_TV_logo.svg/1200px-Pogo_TV_logo.svg.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/2.m3u8',
    quality: '1080p HD',
    badge: 'Chhota Bheem'
  },

  // ================= 6. MUSIC & CONCERTS =================
  {
    id: 'music_9x_jalwa',
    title: '9X Jalwa HD (Evergreen Bollywood)',
    category: 'Music',
    poster: 'https://upload.wikimedia.org/wikipedia/en/c/c3/9X_Jalwa_logo.png',
    url: 'https://mumt03.tangotv.in/Dsly5z3H9XJALWA/index.m3u8',
    quality: '1080p HD',
    badge: 'Golden Hits'
  },
  {
    id: 'music_9x_tashan',
    title: '9X Tashan HD (Punjabi Hits)',
    category: 'Music',
    poster: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/9X_Tashan_logo.png/220px-9X_Tashan_logo.png',
    url: 'https://amg01281-9xmediapvtltd-9xtashan-samsungin-xz1sd.amagi.tv/playlist/amg01281-9xmediapvtltd-9xtashan-samsungin/playlist.m3u8',
    quality: '1080p HD',
    badge: 'Punjabi Hits'
  },
  {
    id: 'music_yrf',
    title: 'YRF Music HD',
    category: 'Music',
    poster: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Yash_Raj_Films_logo.svg/1200px-Yash_Raj_Films_logo.svg.png',
    url: 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01412-xiaomiasia-yrfmusic-xiaomi/playlist.m3u8',
    quality: '1080p HD',
    badge: 'Yash Raj Music'
  },
  {
    id: 'music_7s',
    title: '7S Music HD (South Hits)',
    category: 'Music',
    poster: 'https://raw.githubusercontent.com/iptv-org/epg/master/logos/7S%20Music.png',
    url: 'https://mumt03.tangotv.in/Dsly5z3H7SMUSIC/index.m3u8',
    quality: '1080p HD',
    badge: 'Tamil & Telugu Hits'
  },

  // ================= 7. DOCUMENTARIES & SCIENCE =================
  {
    id: 'docu_discovery_hd',
    title: 'Discovery Channel HD',
    category: 'Documentary',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Discovery_Channel_2019.svg/1200px-Discovery_Channel_2019.svg.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/36.m3u8',
    quality: '1080p HD',
    badge: 'Science & Wildlife'
  },
  {
    id: 'docu_nat_geo_hd',
    title: 'National Geographic HD',
    category: 'Documentary',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/National_Geographic_logo.svg/1200px-National_Geographic_logo.svg.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/37.m3u8',
    quality: '1080p HD',
    badge: 'Exploration'
  },

  // ================= 8. REGIONAL TOP BROADCASTS =================
  {
    id: 'reg_star_pravah_hd',
    title: 'Star Pravah HD (Marathi)',
    category: 'Regional',
    poster: 'https://upload.wikimedia.org/wikipedia/en/2/26/Star_Pravah_logo.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/36.m3u8',
    quality: '1080p HD',
    badge: '#1 Marathi'
  },
  {
    id: 'reg_zee_marathi_hd',
    title: 'Zee Marathi HD',
    category: 'Regional',
    poster: 'https://upload.wikimedia.org/wikipedia/en/8/82/Zee_Marathi_logo.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/37.m3u8',
    quality: '1080p HD',
    badge: 'Marathi Serials'
  },
  {
    id: 'reg_abp_majha',
    title: 'ABP Majha HD',
    category: 'Regional',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/6/61/ABP_News_logo.png',
    url: 'https://yupprestreamliveus.akamaized.net/vglive-sk-355289/majha/master.m3u8',
    quality: '1080p HD',
    badge: 'Maharashtra News'
  },
  {
    id: 'reg_abp_ananda',
    title: 'ABP Ananda HD (Bengali)',
    category: 'Regional',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/6/61/ABP_News_logo.png',
    url: 'https://d2l4ar6y3mrs4k.cloudfront.net/live-streaming/ananda-livetv/master.m3u8',
    quality: '1080p HD',
    badge: 'Bengal News'
  },
  {
    id: 'reg_star_maa_hd',
    title: 'Star Maa HD (Telugu)',
    category: 'Regional',
    poster: 'https://upload.wikimedia.org/wikipedia/en/a/a5/Star_Maa_logo.png',
    url: 'https://jam01su.site/aCMA3XCXUS/GKCgq9Nsq3/24.m3u8',
    quality: '1080p HD',
    badge: 'Telugu Entertainment'
  }
];

const STORAGE_KEY_CUSTOM_M3U = 'pikashow_phone_custom_m3u';
const STORAGE_KEY_JIOTV_HOST = 'pikashow_phone_jiotv_host';

export function normalizeChannelItem(ch, idx = 0) {
  const isFav = isFavoriteChannel(ch);
  return {
    id: ch.id || `ch_${idx + 1}`,
    title: ch.title || ch.name || `Live Channel ${idx + 1}`,
    title_en: ch.title_en || ch.title || `Live Channel ${idx + 1}`,
    category: ch.category || 'Live TV',
    poster: ch.poster || ch.poster_url || '',
    poster_url: ch.poster_url || ch.poster || '',
    url: ch.url,
    is_live: true,
    type: 'live',
    year: 'LIVE',
    is_favorite: isFav,
    badge: ch.badge || 'HD Live',
    ratings: { mlab: { rating: 'LIVE' } },
    genres: [{ name: ch.category || 'Live TV' }],
    description: ch.description || `24/7 High Definition Satellite Broadcast for ${ch.title}`,
    players: [
      {
        translator: ch.quality || 'Live 1080p HD',
        url: ch.url,
        source: 'm3u8',
        quality: ch.quality || '1080p HD'
      }
    ],
    player: [
      {
        translator: ch.quality || 'Live 1080p HD',
        url: ch.url,
        source: 'm3u8',
        quality: ch.quality || '1080p HD'
      }
    ]
  };
}

let cachedIPTVList = null;

export async function getIPTVChannels() {
  if (cachedIPTVList && cachedIPTVList.length > 0) {
    return cachedIPTVList;
  }

  const allChannels = [];
  const seenUrls = new Set();
  const seenTitles = new Set();

  // 1. Add Curated Top HD Sports & Entertainment Channels first
  CURATED_HD_CHANNELS.forEach((c, i) => {
    const norm = normalizeChannelItem(c, i);
    seenUrls.add(c.url);
    seenTitles.add((c.title || '').toLowerCase().trim());
    allChannels.push(norm);
  });

  // 2. Fetch Full 680+ Indian Live TV Channels (iptv-org & Free-TV playlists)
  const playlistUrls = [
    'https://iptv-org.github.io/iptv/countries/in.m3u',
    'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_in.m3u'
  ];

  const customUrl = localStorage.getItem(STORAGE_KEY_CUSTOM_M3U);
  if (customUrl && customUrl.trim().length > 0) {
    playlistUrls.unshift(customUrl.trim());
  }

  for (const url of playlistUrls) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) {
        const text = await res.text();
        const parsed = parseM3U(text);
        parsed.forEach((c, i) => {
          const cleanTitle = (c.title || '').toLowerCase().trim();
          if (c.url && !seenUrls.has(c.url) && !seenTitles.has(cleanTitle)) {
            seenUrls.add(c.url);
            seenTitles.add(cleanTitle);
            allChannels.push(normalizeChannelItem(c, allChannels.length));
          }
        });
      }
    } catch (e) {
      console.warn('[IPTV] Playlist fetch notice for', url, e);
    }
  }

  // 3. Fetch Famelack Live TV Engine (460+ Indian channels & 200+ Sports channels)
  try {
    const famelackInRes = await fetch('https://raw.githubusercontent.com/famelack/famelack-data/main/tv/raw/countries/in.json');
    if (famelackInRes.ok) {
      const famelackData = await famelackInRes.json();
      if (Array.isArray(famelackData)) {
        famelackData.forEach(c => {
          const streamUrl = c.sources?.streams?.[0];
          const cleanTitle = (c.name || '').toLowerCase().trim();
          if (streamUrl && !seenUrls.has(streamUrl) && !seenTitles.has(cleanTitle)) {
            seenUrls.add(streamUrl);
            seenTitles.add(cleanTitle);
            allChannels.push(normalizeChannelItem({
              id: c.nanoid || `fl_${allChannels.length}`,
              title: c.name,
              title_en: c.name,
              url: streamUrl,
              category: c.languages?.includes('tam') ? 'Tamil' :
                        c.languages?.includes('tel') ? 'Telugu' :
                        c.languages?.includes('mar') ? 'Marathi' :
                        c.languages?.includes('ben') ? 'Bengali' :
                        c.languages?.includes('urd') ? 'News' : 'Regional & Hindi',
              poster: `https://raw.githubusercontent.com/iptv-org/epg/master/logos/${encodeURIComponent(c.name)}.png`
            }, allChannels.length));
          }
        });
      }
    }
  } catch (e) {}

  cachedIPTVList = allChannels;
  return allChannels;
}

export function parseM3U(m3uContent) {
  if (!m3uContent) return [];

  const lines = m3uContent.split('\n');
  const channels = [];
  let currentChannel = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentChannel = {};

      const idMatch = line.match(/tvg-id="([^"]+)"/i);
      currentChannel.id = idMatch ? idMatch[1] : `ch_${channels.length + 1}`;

      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      currentChannel.poster = logoMatch ? logoMatch[1] : '';
      currentChannel.poster_url = currentChannel.poster;

      const groupMatch = line.match(/group-title="([^"]+)"/i);
      currentChannel.category = groupMatch ? groupMatch[1] : 'General';

      const commaIndex = line.lastIndexOf(',');
      if (commaIndex !== -1) {
        currentChannel.title = line.substring(commaIndex + 1).trim();
        currentChannel.title_en = currentChannel.title;
      } else {
        currentChannel.title = currentChannel.id;
        currentChannel.title_en = currentChannel.title;
      }
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      if (currentChannel) {
        currentChannel.url = line;
        channels.push(currentChannel);
        currentChannel = null;
      }
    }
  }

  return channels;
}

export async function getJioTVServerChannels(serverHost = 'http://localhost:5001') {
  const host = (serverHost || localStorage.getItem(STORAGE_KEY_JIOTV_HOST) || 'http://localhost:5001').replace(/\/$/, '');
  try {
    const response = await fetch(`${host}/playlist.m3u`);
    if (!response.ok) throw new Error(`JioTV Server unreachable at ${host}`);
    const m3uText = await response.text();
    const channels = parseM3U(m3uText);
    return channels.map((c, i) => normalizeChannelItem({
      ...c,
      category: `JioTV - ${c.category || 'Live'}`,
      is_jiotv: true
    }, i));
  } catch (err) {
    console.warn(`[JioTV] Could not connect to JioTV server at ${host}:`, err);
    return [];
  }
}

export function saveIPTVConfig({ customM3uUrl, jioTvHost }) {
  if (customM3uUrl !== undefined) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_M3U, customM3uUrl);
  }
  if (jioTvHost !== undefined) {
    localStorage.setItem(STORAGE_KEY_JIOTV_HOST, jioTvHost);
  }
}

export function getIPTVConfig() {
  return {
    customM3uUrl: localStorage.getItem(STORAGE_KEY_CUSTOM_M3U) || '',
    jioTvHost: localStorage.getItem(STORAGE_KEY_JIOTV_HOST) || 'http://localhost:5001'
  };
}
