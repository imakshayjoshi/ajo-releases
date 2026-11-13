export function getContainerRevealScrollTop(currentScrollTop, containerTop, scrollerTop = 0, margin = 16) {
  const current = Number(currentScrollTop) || 0;
  const scroller = Number(scrollerTop) || 0;
  const target = scroller + margin;
  const delta = target - containerTop;
  if (delta <= 0) return current;
  return Math.max(0, current - delta);
}

export function getResumeStartMs(currentTime, resumePosition, lastPosition) {
  const current = Number(currentTime) || 0;
  const resume = Number(resumePosition) || 0;
  const last = Number(lastPosition) || 0;
  return Math.round((current > 0 ? current : (resume > 0 ? resume : last)) * 1000);
}
