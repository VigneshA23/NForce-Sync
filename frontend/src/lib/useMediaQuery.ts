import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query from JS.
 *
 * Almost all responsive behaviour in this app is done in CSS (a className next
 * to the existing inline style, overridden inside a @media block in index.css —
 * see the "Responsive adaptation" section there). Reach for this hook ONLY when
 * a *prop* has to change rather than a style: Recharts sizing props such as
 * `<YAxis width>` are the motivating case, since they are measured in JS and
 * can't be reached by a stylesheet.
 *
 * Prefer CSS whenever the change can be expressed as one, because CSS costs no
 * re-render and cannot desync from the breakpoint ladder.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    // Re-read on subscribe: the query may have changed, or the viewport may
    // have moved between the initial render and this effect.
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Phone-width check, matching the 640px step of the CSS breakpoint ladder. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 640px)');
}
