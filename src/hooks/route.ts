import { useEffect, useState } from 'react';

/** Minimal hash router: "#/progress/climbing" → ["progress", "climbing"]. Works on GitHub Pages and offline. */
export function parseHash(hash: string): string[] {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  return path ? path.split('/').filter(Boolean).map(decodeURIComponent) : ['today'];
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  const target = `#/${path.replace(/^\/+/, '')}`;
  if (window.location.hash !== target) window.location.hash = target;
}

/** Back buttons go to a fixed parent screen, so deep links never leave the app. */
export function goBack(fallback: string): void {
  navigate(fallback);
}
