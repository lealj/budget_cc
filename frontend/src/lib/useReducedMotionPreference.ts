import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const snapshot = () => window.matchMedia(query).matches;
// Subscribe to live OS preference changes; the server fallback conservatively disables motion.
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
