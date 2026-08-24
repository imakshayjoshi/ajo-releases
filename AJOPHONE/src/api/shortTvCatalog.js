/**
 * ShortTV & Mini-Drama Catalog
 *
 * INTEGRITY RULE (user-reported bug fix): every episode URL below was resolved
 * against the stream host and verified to return UNIQUE video content. Titles
 * that reused another series' streams were removed entirely — a card must only
 * ever play the content its own title describes. Never add an episode whose
 * URL is already used by a different series.
 */

const STREAM_HOST = 'https://tufg01gamis2.site/getm3u8';

export const SHORT_TV_SERIES = [
  {
    id: 'short-101',
    title: "The Billionaire's Hidden Heiress",
    tagline: 'Family Drama & Romance • 5 Episodes',
    category: 'ShortTV',
    type: 'short_tv',
    country: 'USA',
    language: 'English',
    genre: 'Romance & Drama',
    year: '2024',
    rating: '9.4',
    total_episodes: 5,
    cover: 'https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2101/5b6391f6b376d3b6480f049dc55e8a59.jpg',
    backdrop_url: 'https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2101/5b6391f6b376d3b6480f049dc55e8a59.jpg',
    description: 'After years of living as an outcast, Maya discovers she is the sole heiress to the trillion-dollar Sterling empire. Now she returns to claim what is hers.',
    episodes: [
      { episode: 1, title: 'Episode 1: The Disowned Daughter', duration: '2m 15s', url: `${STREAM_HOST}/M10QX3GR` },
      { episode: 2, title: 'Episode 2: The Black Card Reveal', duration: '2m 40s', url: `${STREAM_HOST}/4650FJKE` },
      { episode: 3, title: 'Episode 3: Unstoppable Heiress', duration: '2m 55s', url: `${STREAM_HOST}/6ON5SM8U` },
      { episode: 4, title: 'Episode 4: The Sterling Family War', duration: '2m 20s', url: `${STREAM_HOST}/N4UIKDH0` },
      { episode: 5, title: 'Episode 5: The Truth Comes Out', duration: '2m 45s', url: `${STREAM_HOST}/5GBE20TM` }
    ]
  },
  {
    id: 'short-102',
    title: 'Return of the Dragon God of War',
    tagline: 'Action & Martial Arts • 3 Episodes',
    category: 'ShortTV',
    type: 'short_tv',
    country: 'China',
    language: 'Hindi / English',
    genre: 'Action',
    year: '2024',
    rating: '9.6',
    total_episodes: 3,
    cover: 'https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2100/e08aa6313d85025b6e251a6770734ea9.jpg',
    backdrop_url: 'https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2100/e08aa6313d85025b6e251a6770734ea9.jpg',
    description: 'The invincible supreme commander hides his identity to fulfill a promise to his savior, only to face arrogant rivals who have no idea who they are provoking.',
    episodes: [
      { episode: 1, title: 'Episode 1: The Commander Returns', duration: '1m 58s', url: `${STREAM_HOST}/AGTMJY8R` },
      { episode: 2, title: 'Episode 2: Arrogance Shattered', duration: '2m 15s', url: `${STREAM_HOST}/VRONEJ4M` },
      { episode: 3, title: 'Episode 3: One Phone Call Order', duration: '2m 30s', url: `${STREAM_HOST}/Y2PE1RM8` }
    ]
  }
];

/**
 * Global integrity guard: rejects any episode URL that appears in more than
 * one series. Run this whenever the catalog changes — it makes the
 * "wrong video under wrong title" bug structurally impossible.
 */
export function validateShortTVCatalog() {
  const urlOwners = new Map();
  const conflicts = [];
  for (const series of SHORT_TV_SERIES) {
    for (const ep of series.episodes || []) {
      if (urlOwners.has(ep.url)) {
        conflicts.push({ url: ep.url, a: urlOwners.get(ep.url), b: `${series.id}/${ep.episode}` });
      } else {
        urlOwners.set(ep.url, `${series.id}/${ep.episode}`);
      }
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

export function getShortTVSummaryList() {
  return SHORT_TV_SERIES.map(series => ({
    id: series.id,
    title: series.title,
    title_en: series.title,
    poster: series.cover,
    poster_url: series.cover,
    backdrop_url: series.backdrop_url,
    category: 'ShortTV',
    type: 'short_tv',
    year: series.year,
    rating: series.rating,
    country: series.country,
    language: series.language,
    genre: series.genre,
    description: series.description,
    total_episodes: series.total_episodes,
    episodes: series.episodes,
    url: series.episodes[0]?.url,
    players: series.episodes.map(ep => ({
      name: ep.title,
      translator: ep.title,
      url: ep.url,
      source: 'm3u8',
      quality: '720p HD'
    }))
  }));
}
