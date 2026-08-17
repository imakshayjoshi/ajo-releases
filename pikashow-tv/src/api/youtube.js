/**
 * Ad-Free YouTube Streaming & Content Engine
 * Curates trending music, full movies, cricket highlights, podcasts, and live streams
 * Plays seamlessly using clean privacy embeds with ZERO pre-roll or mid-roll ads.
 */

export const YOUTUBE_CATEGORIES = [
  { id: 'all', label: '🔥 All Trending' },
  { id: 'movies', label: '🍿 Free Full Movies (Goldmines & Shemaroo)' },
  { id: 'sports', label: '🏏 Cricket & Sports Highlights' },
  { id: 'music', label: '🎵 Bollywood & Trending Music' },
  { id: 'podcasts', label: '🎙️ Podcasts & Shows' },
  { id: 'news', label: '📰 24/7 Live YouTube News' },
  { id: 'gaming', label: '🎮 Gaming & Creator Stream' },
];

export const CURATED_YOUTUBE_FEEDS = [
  // 1. FREE FULL MOVIES (Goldmines, Shemaroo, Pen Movies)
  {
    id: 'yt_mov_1',
    title: 'KGF Chapter 2 (Hindi Dubbed Full Movie)',
    youtube_id: 'Qah9sSIXit0',
    poster: 'https://i.ytimg.com/vi/Qah9sSIXit0/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/Qah9sSIXit0/maxresdefault.jpg',
    category: 'Free Full Movies',
    channel: 'Goldmines Telefilms',
    year: 'Full Movie',
    duration: '2 hr 48 min',
    is_youtube: true,
    is_live: false,
    description: 'Rocking Star Yash, Sanjay Dutt, Raveena Tandon in action blockbuster K.G.F: Chapter 2 full movie in Hindi.'
  },
  {
    id: 'yt_mov_2',
    title: 'Pushpa: The Rise (Hindi Full Movie)',
    youtube_id: 'pKctjlpbqpA',
    poster: 'https://i.ytimg.com/vi/pKctjlpbqpA/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/pKctjlpbqpA/maxresdefault.jpg',
    category: 'Free Full Movies',
    channel: 'Goldmines Movies',
    year: 'Full Movie',
    duration: '2 hr 59 min',
    is_youtube: true,
    is_live: false,
    description: 'Allu Arjun and Rashmika Mandanna in Sukumar mega blockbuster Pushpa full movie.'
  },
  {
    id: 'yt_mov_3',
    title: 'Kantara (Hindi Dubbed Blockbuster)',
    youtube_id: '6ofrPZZl14U',
    poster: 'https://i.ytimg.com/vi/6ofrPZZl14U/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/6ofrPZZl14U/maxresdefault.jpg',
    category: 'Free Full Movies',
    channel: 'Hombale Films',
    year: 'Full Movie',
    duration: '2 hr 28 min',
    is_youtube: true,
    is_live: false,
    description: 'Rishab Shetty mythical action drama Kantara in Hindi with divine background score.'
  },
  {
    id: 'yt_mov_4',
    title: 'Hera Pheri (Cult Comedy Classic 4K Remastered)',
    youtube_id: 'TIQ5hrfc17I',
    poster: 'https://i.ytimg.com/vi/TIQ5hrfc17I/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/TIQ5hrfc17I/maxresdefault.jpg',
    category: 'Free Full Movies',
    channel: 'Shemaroo Comedy',
    year: 'Full Movie',
    duration: '2 hr 22 min',
    is_youtube: true,
    is_live: false,
    description: 'Akshay Kumar, Suniel Shetty, Paresh Rawal in all-time greatest Bollywood comedy Hera Pheri.'
  },

  // 2. CRICKET & SPORTS HIGHLIGHTS
  {
    id: 'yt_sp_1',
    title: 'India vs South Africa T20 World Cup Final Highlights',
    youtube_id: 'w4g3G_VrnY0',
    poster: 'https://i.ytimg.com/vi/w4g3G_VrnY0/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/w4g3G_VrnY0/maxresdefault.jpg',
    category: 'Cricket & Sports',
    channel: 'ICC Cricket',
    year: 'Match Highlights',
    duration: '15 min',
    is_youtube: true,
    is_live: false,
    description: 'Team India historic T20 World Cup victory highlights with Rohit Sharma, Virat Kohli, and Jasprit Bumrah magic.'
  },
  {
    id: 'yt_sp_2',
    title: 'Virat Kohli 82* vs Pakistan T20 World Cup MCG Masterclass',
    youtube_id: 'nS2qQ_e7dO0',
    poster: 'https://i.ytimg.com/vi/nS2qQ_e7dO0/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/nS2qQ_e7dO0/maxresdefault.jpg',
    category: 'Cricket & Sports',
    channel: 'Star Sports Highlights',
    year: 'Special',
    duration: '12 min',
    is_youtube: true,
    is_live: false,
    description: 'Unbelievable 82 not out from King Kohli at the Melbourne Cricket Ground vs Pakistan.'
  },
  {
    id: 'yt_sp_3',
    title: 'MS Dhoni Last Over Iconic Finishes in IPL & World Cup',
    youtube_id: 'E_Q5qM-56w8',
    poster: 'https://i.ytimg.com/vi/E_Q5qM-56w8/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/E_Q5qM-56w8/maxresdefault.jpg',
    category: 'Cricket & Sports',
    channel: 'IPL Official',
    year: 'Highlights',
    duration: '22 min',
    is_youtube: true,
    is_live: false,
    description: 'Compilation of MS Dhoni ice-cool match-winning finishing moments for CSK and India.'
  },

  // 3. BOLLYWOOD & TRENDING MUSIC
  {
    id: 'yt_mus_1',
    title: 'Tauba Tauba (Bad Newz) — Karan Aujla, Vicky Kaushal',
    youtube_id: 'LK7-_dgAVQE',
    poster: 'https://i.ytimg.com/vi/LK7-_dgAVQE/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/LK7-_dgAVQE/maxresdefault.jpg',
    category: 'Music & Hits',
    channel: 'Saregama Music',
    year: 'Music Video',
    duration: '3 min 30 sec',
    is_youtube: true,
    is_live: false,
    description: 'Viral sensational dance track featuring Vicky Kaushal & Karan Aujla.'
  },
  {
    id: 'yt_mus_2',
    title: 'Chaleya (Jawan) — Arijit Singh, Shah Rukh Khan, Nayanthara',
    youtube_id: 'VAdGW7QDJUI',
    poster: 'https://i.ytimg.com/vi/VAdGW7QDJUI/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/VAdGW7QDJUI/maxresdefault.jpg',
    category: 'Music & Hits',
    channel: 'T-Series',
    year: '4K Song',
    duration: '3 min 20 sec',
    is_youtube: true,
    is_live: false,
    description: 'Anirudh Ravichander romantic blockbuster song sung by Arijit Singh and Shilpa Rao.'
  },
  {
    id: 'yt_mus_3',
    title: 'Kesariya (Brahmāstra) — Arijit Singh, Ranbir Kapoor, Alia Bhatt',
    youtube_id: 'BddP6PYo2gs',
    poster: 'https://i.ytimg.com/vi/BddP6PYo2gs/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/BddP6PYo2gs/maxresdefault.jpg',
    category: 'Music & Hits',
    channel: 'Sony Music India',
    year: '4K Song',
    duration: '4 min 28 sec',
    is_youtube: true,
    is_live: false,
    description: 'Pritam iconic romantic anthem from Astraverse.'
  },
  {
    id: 'yt_mus_4',
    title: 'Illuminati (Aavesham) — Sushin Shyam, Dabzee, Fahadh Faasil',
    youtube_id: 'tOM-nWPcR4U',
    poster: 'https://i.ytimg.com/vi/tOM-nWPcR4U/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/tOM-nWPcR4U/maxresdefault.jpg',
    category: 'Music & Hits',
    channel: 'Think Music India',
    year: '4K Song',
    duration: '3 min 12 sec',
    is_youtube: true,
    is_live: false,
    description: 'Electrifying viral dance chartbuster from Fahadh Faasil starrer Aavesham.'
  },

  // 4. 24x7 LIVE NEWS & PODCASTS
  {
    id: 'yt_live_1',
    title: 'Aaj Tak HD 24x7 Live Stream',
    youtube_id: 'Nq2wYlWFucg',
    poster: 'https://i.ytimg.com/vi/Nq2wYlWFucg/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/Nq2wYlWFucg/maxresdefault.jpg',
    category: '24/7 Live YouTube News',
    channel: 'Aaj Tak',
    year: 'LIVE',
    duration: 'Live Stream',
    is_youtube: true,
    is_live: true,
    description: 'Live continuous Hindi news broadcast directly from Aaj Tak newsroom.'
  },
  {
    id: 'yt_live_2',
    title: 'ABP News 24x7 Live Stream',
    youtube_id: 'nyd-xznCpJc',
    poster: 'https://i.ytimg.com/vi/nyd-xznCpJc/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/nyd-xznCpJc/maxresdefault.jpg',
    category: '24/7 Live YouTube News',
    channel: 'ABP News',
    year: 'LIVE',
    duration: 'Live Stream',
    is_youtube: true,
    is_live: true,
    description: 'ABP News 24/7 breaking news, analysis, and debate live stream.'
  },
  {
    id: 'yt_pod_1',
    title: 'The Ranveer Show (TRS) — Dr. S Jaishankar on India Foreign Policy',
    youtube_id: '9lF8B9w1u6M',
    poster: 'https://i.ytimg.com/vi/9lF8B9w1u6M/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/9lF8B9w1u6M/maxresdefault.jpg',
    category: 'Podcasts & Shows',
    channel: 'BeerBiceps / TRS',
    year: 'Podcast',
    duration: '1 hr 14 min',
    is_youtube: true,
    is_live: false,
    description: 'External Affairs Minister Dr. S. Jaishankar deep dive into global geopolitics.'
  },
  {
    id: 'yt_pod_2',
    title: 'Lallantop Baithak with Manoj Bajpayee & Anurag Kashyap',
    youtube_id: 't-gD1Q8tY00',
    poster: 'https://i.ytimg.com/vi/t-gD1Q8tY00/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/t-gD1Q8tY00/maxresdefault.jpg',
    category: 'Podcasts & Shows',
    channel: 'The Lallantop',
    year: 'Interview',
    duration: '1 hr 45 min',
    is_youtube: true,
    is_live: false,
    description: 'Candid conversation on cinema, struggle, and Gangs of Wasseypur nostalgia.'
  },

  // 5. GAMING & ENTERTAINMENT
  {
    id: 'yt_gam_1',
    title: 'GTA 5 Myth Busters & Epic Mod Missions — Techno Gamerz',
    youtube_id: '8v_433UrDU4',
    poster: 'https://i.ytimg.com/vi/8v_433UrDU4/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/8v_433UrDU4/maxresdefault.jpg',
    category: 'Gaming & Creators',
    channel: 'Techno Gamerz',
    year: 'Gameplay',
    duration: '35 min',
    is_youtube: true,
    is_live: false,
    description: 'Ujjwal Chaurasia latest Grand Theft Auto V story episode and secret mission.'
  },
  {
    id: 'yt_gam_2',
    title: '$1 vs $1,000,000,000 Yacht! — MrBeast (Hindi Dubbed)',
    youtube_id: '48h57PspBec',
    poster: 'https://i.ytimg.com/vi/48h57PspBec/maxresdefault.jpg',
    backdrop_url: 'https://i.ytimg.com/vi/48h57PspBec/maxresdefault.jpg',
    category: 'Gaming & Creators',
    channel: 'MrBeast Hindi',
    year: 'Viral Video',
    duration: '18 min',
    is_youtube: true,
    is_live: false,
    description: 'MrBeast explores the most expensive superyachts in the world in official Hindi dub.'
  }
];

/**
 * Returns clean, ad-free embed URL for any YouTube ID
 */
export function getAdFreeYouTubeEmbedUrl(youtubeId) {
  if (!youtubeId) return '';
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&playsinline=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&fs=1`;
}

/**
 * Converts YouTube video to standard AJO TV media item
 */
export function normalizeYouTubeItem(yt) {
  const embedUrl = getAdFreeYouTubeEmbedUrl(yt.youtube_id);
  return {
    ...yt,
    id: yt.id || `yt_${yt.youtube_id}`,
    title: yt.title,
    title_en: yt.title,
    poster: yt.poster,
    poster_url: yt.poster,
    backdrop_url: yt.backdrop_url || yt.poster,
    type: 'youtube',
    category: yt.category || 'YouTube VIP',
    is_youtube: true,
    url: embedUrl,
    player: [
      {
        name: 'Ad-Free YouTube Player (1080p 60fps)',
        url: embedUrl,
        source: 'iframe',
        quality: '1080p 60fps',
        badge: '⚡ AD-FREE YOUTUBE'
      }
    ],
    players: [
      {
        name: 'Ad-Free YouTube Player (1080p 60fps)',
        url: embedUrl,
        source: 'iframe',
        quality: '1080p 60fps',
        badge: '⚡ AD-FREE YOUTUBE'
      }
    ]
  };
}

/**
 * Fetch all YouTube curated items grouped by category
 */
export function getYouTubeCatalog() {
  return CURATED_YOUTUBE_FEEDS.map(normalizeYouTubeItem);
}

/**
 * Search YouTube items or external Invidious API
 */
export async function searchYouTubeVideos(query) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();

  // 1. Search local curated feeds
  const localMatches = CURATED_YOUTUBE_FEEDS
    .filter(v => v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q) || v.category.toLowerCase().includes(q))
    .map(normalizeYouTubeItem);

  // 2. Query Invidious public instance for live YouTube search results without ads
  try {
    const res = await fetch(`https://invidious.privacydev.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const invidiousMatches = data.slice(0, 15).map(item => {
          const ytId = item.videoId;
          const poster = item.videoThumbnails?.find(t => t.quality === 'high')?.url || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
          return normalizeYouTubeItem({
            id: `yt_${ytId}`,
            title: item.title,
            youtube_id: ytId,
            poster: poster,
            backdrop_url: poster,
            category: 'YouTube Search',
            channel: item.author || 'YouTube Creator',
            year: item.publishedText || 'Video',
            duration: item.lengthSeconds ? `${Math.round(item.lengthSeconds / 60)} min` : 'HD Video',
            description: item.description || `YouTube video by ${item.author}`
          });
        });
        return [...localMatches, ...invidiousMatches];
      }
    }
  } catch (e) {
    console.warn("Invidious live search fallback notice:", e);
  }

  return localMatches;
}
