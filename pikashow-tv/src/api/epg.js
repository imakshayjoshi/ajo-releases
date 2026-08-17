/**
 * EPG (Electronic Program Guide) Service
 * Generates and parses real-time television schedules, current program progress, and upcoming shows.
 */

// Common realistic TV schedule templates for Indian broadcasters
const SCHEDULE_TEMPLATES = {
  sports: [
    { title: "Live Cricket: T20 Super League - Match Center", duration: 210, desc: "Live match coverage, ball-by-ball analysis, expert studio commentary and post-match presentation." },
    { title: "Match Highlights: Best Sixes & Wickets", duration: 60, desc: "High-octane moments and key match-winning turning points." },
    { title: "The Dugout: Tactical Cricket Analysis", duration: 45, desc: "Deep analytical dive into player techniques and match strategies." },
    { title: "Live Football: Premier Championship", duration: 120, desc: "Live broadcast of today's high-stakes football clash." },
    { title: "Motorsport & Superbikes Extreme", duration: 60, desc: "Fast-paced racing thrills, podium celebrations, and track reviews." },
  ],
  entertainment: [
    { title: "Superstar Blockbuster Movie", duration: 160, desc: "A captivating family entertainer packed with high drama, action, and music." },
    { title: "Grand Reality Game Show", duration: 75, desc: "Celebrity contestants face thrilling challenges and entertaining tasks." },
    { title: "Primetime Family Drama", duration: 40, desc: "Daily emotional saga following love, rivalry, and family bonds." },
    { title: "Comedy Nights Non-Stop", duration: 50, desc: "Stand-up comedy, celebrity guests, and laugh-out-loud sketches." },
    { title: "Late Night Mystery Cinema", duration: 130, desc: "Suspense thriller mystery that keeps you on the edge of your seat." },
  ],
  news: [
    { title: "Prime Debate: The Nation at 9", duration: 60, desc: "Heated panel discussion on the biggest national headline of the day." },
    { title: "Non-Stop 100 Headlines", duration: 30, desc: "Fast-paced summary of all national, regional, and global breaking news." },
    { title: "Special Ground Investigation", duration: 45, desc: "In-depth investigative journalism uncovering the ground realities." },
    { title: "Business & Stock Market Today", duration: 30, desc: "Sensex, Nifty, tech startups, and global financial updates." },
    { title: "World View with Global Correspondents", duration: 45, desc: "International diplomacy, geopolitical affairs, and world events." },
  ],
  music: [
    { title: "Top 20 Hit Music Video Countdown", duration: 60, desc: "The hottest trending chartbusters and dance numbers." },
    { title: "Pure Bollywood Romantic Hits", duration: 45, desc: "Melodious love anthems from the finest composers." },
    { title: "Retro Classics Hour", duration: 60, desc: "Evergreen golden melodies from legendary singers." },
    { title: "Club DJ Mix Non-Stop", duration: 75, desc: "High-energy remix party tracks and beats." },
  ],
  kids: [
    { title: "Adventure Squad & The Lost Realm", duration: 30, desc: "Exciting animated adventures filled with courage and friendship." },
    { title: "Funny Cartoons & Prankster Chronicles", duration: 30, desc: "Hilarious slapstick humor for all ages." },
    { title: "Super Robot Space Missions", duration: 45, desc: "Action-packed sci-fi robot battles across the galaxy." },
  ]
};

/**
 * Deterministically generates a full 24-hour EPG schedule for any channel
 */
export function getChannelEPG(channel) {
  if (!channel) return [];

  const titleLower = (channel.title || '').toLowerCase();
  const categoryLower = (channel.category || '').toLowerCase();

  let genre = 'entertainment';
  if (titleLower.includes('sport') || titleLower.includes('cricket') || titleLower.includes('ten')) {
    genre = 'sports';
  } else if (titleLower.includes('news') || titleLower.includes('tak') || titleLower.includes('tv')) {
    genre = 'news';
  } else if (titleLower.includes('music') || titleLower.includes('9x') || titleLower.includes('mtv')) {
    genre = 'music';
  } else if (titleLower.includes('kids') || titleLower.includes('cartoon') || titleLower.includes('pogo')) {
    genre = 'kids';
  }

  const templateList = SCHEDULE_TEMPLATES[genre] || SCHEDULE_TEMPLATES.entertainment;
  
  // Seed time starting from today at midnight
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  
  // Channel hash seed
  let hash = 0;
  for (let i = 0; i < (channel.title || '').length; i++) {
    hash = ((hash << 5) - hash) + channel.title.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const programs = [];
  let currentTime = new Date(startOfDay.getTime() + (hash % 45) * 60000);
  let templateIndex = hash % templateList.length;

  while (currentTime.getTime() < startOfDay.getTime() + 86400000 * 2) { // 48 hours
    const template = templateList[templateIndex % templateList.length];
    const durationMs = template.duration * 60000;
    const endTime = new Date(currentTime.getTime() + durationMs);

    programs.push({
      id: `epg_${programs.length}_${hash}`,
      title: template.title,
      description: template.desc,
      startTime: new Date(currentTime),
      endTime: new Date(endTime),
      durationMin: template.duration,
      startTimeFormatted: formatTime(currentTime),
      endTimeFormatted: formatTime(endTime),
      isLiveNow: now >= currentTime && now < endTime,
      progressPercent: calculateProgress(currentTime, endTime, now),
    });

    currentTime = endTime;
    templateIndex++;
  }

  return programs;
}

/**
 * Gets currently airing program and next up for a channel
 */
export function getCurrentAndNextProgram(channel) {
  const schedule = getChannelEPG(channel);
  const now = new Date();

  const current = schedule.find(p => now >= p.startTime && now < p.endTime) || schedule[0];
  const currentIndex = schedule.indexOf(current);
  const next = schedule[currentIndex + 1] || null;

  return {
    current: current ? {
      ...current,
      progressPercent: calculateProgress(current.startTime, current.endTime, now)
    } : null,
    next: next,
    schedule: schedule.slice(Math.max(0, currentIndex), currentIndex + 10)
  };
}

function calculateProgress(start, end, now) {
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

function formatTime(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minStr = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minStr} ${ampm}`;
}
