import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls the element whose id matches the current URL hash into view — lets a Global Search
 * "sub-heading" result land on a specific section of a single-scroll page (Dashboard, My
 * Utilization, Profile) that has no tab/route of its own for that section.
 *
 * `ready` gates the scroll until the page's own data has rendered (pass a loading flag's
 * negation, or omit it for pages that render their sections unconditionally), since the
 * target id doesn't exist in the DOM until then.
 */
export function useHashScroll(ready = true) {
  const location = useLocation();
  useEffect(() => {
    if (!ready || !location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, ready]);
}
