/**
 * Utility to identify the streaming source / broadcaster for any media item
 */
export function getSourceProvider(item) {
  if (!item) return { name: 'AJO Stream', badge: 'AJO', color: '#3b82f6', icon: '🎬' };

  const title = (item.title_en || item.title || item.title_ru || item.name || '').toLowerCase();
  const category = (item.category || '').toLowerCase();
  const type = (item.type || '').toLowerCase();
  const isLive = item.is_live || type === 'live' || item.year === 'LIVE';

  // Live TV Network Mapping
  if (isLive || category.includes('live')) {
    if (title.includes('star') || title.includes('hotstar') || title.includes('disney')) {
      return { name: 'JioHotstar / Star Network', badge: 'JioHotstar', color: '#134074', icon: '⭐' };
    }
    if (title.includes('sony') || title.includes('ten') || title.includes('sab') || title.includes('max')) {
      return { name: 'Sony Pictures Network', badge: 'SonyLIV', color: '#03045e', icon: '📺' };
    }
    if (title.includes('zee') || title.includes('&tv') || title.includes('cinema')) {
      return { name: 'Zee Entertainment', badge: 'Zee5', color: '#5a189a', icon: '💎' };
    }
    if (title.includes('color') || title.includes('sports18') || title.includes('mtv') || title.includes('vh1') || title.includes('jio')) {
      return { name: 'Viacom18 / JioCinema', badge: 'JioCinema', color: '#d90429', icon: '🍿' };
    }
    if (title.includes('willow') || title.includes('fancode') || title.includes('sport') || title.includes('cricket')) {
      return { name: 'Cricfy Sports Live', badge: 'Cricfy', color: '#028090', icon: '⚡' };
    }
    if (title.includes('aaj tak') || title.includes('abp') || title.includes('ndtv') || title.includes('republic') || title.includes('news')) {
      return { name: 'National News Network', badge: 'News Live', color: '#b91c1c', icon: '📰' };
    }
    if (title.includes('dd ') || title.includes('doordarshan')) {
      return { name: 'Doordarshan National', badge: 'DD Live', color: '#047857', icon: '📡' };
    }
    return { name: '24x7 Satellite Broadcast', badge: 'Live TV', color: '#0284c7', icon: '🔴' };
  }

  // Web Series & TV Shows
  if (type === 'series' || type === 'serial' || category.includes('serial') || category.includes('series')) {
    // Specific popular titles
    if (title.includes('farzi') || title.includes('panchayat') || title.includes('mirzapur') || title.includes('family man') || title.includes('paatal')) {
      return { name: 'Amazon Prime Video', badge: 'Prime Video', color: '#0077b6', icon: '✨' };
    }
    if (title.includes('sacred games') || title.includes('delhi crime') || title.includes('stranger') || title.includes('squid') || title.includes('money heist') || title.includes('kota factory')) {
      return { name: 'Netflix Original', badge: 'Netflix', color: '#b7094c', icon: '🎬' };
    }
    if (title.includes('scam') || title.includes('rocket boys') || title.includes('gullak') || title.includes('maharani') || title.includes('undekhi')) {
      return { name: 'SonyLIV Exclusive', badge: 'SonyLIV', color: '#03045e', icon: '📺' };
    }
    if (title.includes('special ops') || title.includes('criminal justice') || title.includes('aarya') || title.includes('karan')) {
      return { name: 'JioHotstar Specials', badge: 'JioHotstar', color: '#134074', icon: '⭐' };
    }
    if (title.includes('asur') || title.includes('taaza khabar') || title.includes('apharan')) {
      return { name: 'JioCinema Premium', badge: 'JioCinema', color: '#d90429', icon: '🍿' };
    }
    // Hash-based deterministic distribution for other series
    const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const providers = [
      { name: 'Netflix Original', badge: 'Netflix', color: '#b7094c', icon: '🎬' },
      { name: 'Amazon Prime Video', badge: 'Prime Video', color: '#0077b6', icon: '✨' },
      { name: 'SonyLIV Exclusive', badge: 'SonyLIV', color: '#03045e', icon: '📺' },
      { name: 'JioHotstar Specials', badge: 'JioHotstar', color: '#134074', icon: '⭐' },
      { name: 'Zee5 Original', badge: 'Zee5', color: '#5a189a', icon: '💎' },
      { name: 'JioCinema Premium', badge: 'JioCinema', color: '#d90429', icon: '🍿' },
    ];
    return providers[hash % providers.length];
  }

  // Movies (Bollywood & Hollywood)
  if (category.includes('hollywood') || (item.countries && item.countries.some(c => c.name?.toLowerCase().includes('usa') || c.name?.toLowerCase().includes('uk')))) {
    const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const providers = [
      { name: 'Netflix Cinema', badge: 'Netflix', color: '#b7094c', icon: '🎬' },
      { name: 'Prime Video 4K UHD', badge: 'Prime Video', color: '#0077b6', icon: '✨' },
      { name: 'JioHotstar Premium', badge: 'JioHotstar', color: '#134074', icon: '⭐' },
      { name: 'Apple TV+ Cinema', badge: 'Apple TV+', color: '#334155', icon: '🍏' },
      { name: 'Sony Pictures Core', badge: 'SonyLIV', color: '#03045e', icon: '📺' },
    ];
    return providers[hash % providers.length];
  }

  // Bollywood / Indian Cinema
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const providers = [
    { name: 'JioHotstar VIP', badge: 'JioHotstar', color: '#134074', icon: '⭐' },
    { name: 'Netflix India', badge: 'Netflix', color: '#b7094c', icon: '🎬' },
    { name: 'Amazon Prime Video', badge: 'Prime Video', color: '#0077b6', icon: '✨' },
    { name: 'Zee5 Premium', badge: 'Zee5', color: '#5a189a', icon: '💎' },
    { name: 'JioCinema Max', badge: 'JioCinema', color: '#d90429', icon: '🍿' },
    { name: 'SonyLIV Cinema', badge: 'SonyLIV', color: '#03045e', icon: '📺' },
  ];
  return providers[hash % providers.length];
}
