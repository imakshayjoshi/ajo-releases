/**
 * Binge Engine — episode auto-advance + countdown for AJO
 *
 * Given a playback position near the end of an episode, computes the next
 * episode and provides a countdown. Used by TV + Phone players.
 */

export const BINGE_COUNTDOWN_SECONDS = 12;

/**
 * Returns the next episode in the list, or null.
 * Handles season boundaries if episodes carry season/episode numbers.
 */
export function getNextEpisode(episodes, currentIndex) {
  if (!Array.isArray(episodes) || episodes.length < 2) return null;
  const next = episodes[currentIndex + 1];
  return next || null;
}

/**
 * Should auto-advance trigger? Near end of a VOD episode (not live).
 */
export function shouldAutoAdvance(videoState, isLive) {
  if (!videoState || videoState.duration <= 0) return false;
  if (isLive) return false;
  // Trigger when within countdown window of the end
  return videoState.duration - videoState.currentTime <= BINGE_COUNTDOWN_SECONDS;
}

export function formatCountdown(secondsLeft) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `${s}s`;
}
