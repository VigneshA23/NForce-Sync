import { createContext, useContext, useEffect, useState } from 'react';
import { useTheme } from './theme';

export type AccentColor = 'red' | 'purple' | 'blue' | 'green' | 'pink';

const STORAGE_KEY = 'nf-accent-color';
const DEFAULT_ACCENT: AccentColor = 'red';

// Two "bright" values per accent — dark-surface and light-surface — mirroring the WCAG-AA
// tuning already done for red in index.css (light needs a darker bright than dark does to
// stay ≥4.5:1 on white). brand/brandDeep don't need the split; they're already dark enough
// to read fine as gradient stops and dots in both themes.
const ACCENT_SWATCHES: Record<AccentColor, {
  label: string;
  brand: string;
  brandDeep: string;
  brightDark: string;
  brightLight: string;
}> = {
  red:    { label: 'Red',    brand: '#B11116', brandDeep: '#7A0C10', brightDark: '#E4373D', brightLight: '#C81A1F' },
  purple: { label: 'Purple', brand: '#6D28D9', brandDeep: '#4C1D95', brightDark: '#9F67F5', brightLight: '#7C3AED' },
  blue:   { label: 'Blue',   brand: '#1D4ED8', brandDeep: '#1E3A8A', brightDark: '#3B82F6', brightLight: '#1D4ED8' },
  green:  { label: 'Green',  brand: '#15803D', brandDeep: '#14532D', brightDark: '#22C55E', brightLight: '#15803D' },
  pink:   { label: 'Pink',   brand: '#BE185D', brandDeep: '#831843', brightDark: '#EC4899', brightLight: '#BE185D' },
};

export { ACCENT_SWATCHES };

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function getInitialAccent(): AccentColor {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in ACCENT_SWATCHES) return stored as AccentColor;
  } catch {
    // localStorage unavailable — default.
  }
  return DEFAULT_ACCENT;
}

function applyAccent(accent: AccentColor, theme: 'dark' | 'light') {
  const root = document.documentElement.style;
  // Default accent: clear any inline overrides so the stylesheet's own finely-tuned
  // per-theme --brand* values (index.css) apply untouched.
  if (accent === DEFAULT_ACCENT) {
    root.removeProperty('--brand');
    root.removeProperty('--brand-bright');
    root.removeProperty('--brand-deep');
    root.removeProperty('--bm-ring');
    root.removeProperty('--bm-glow');
    return;
  }
  const swatch = ACCENT_SWATCHES[accent];
  const bright = theme === 'light' ? swatch.brightLight : swatch.brightDark;
  root.setProperty('--brand', swatch.brand);
  root.setProperty('--brand-bright', bright);
  root.setProperty('--brand-deep', swatch.brandDeep);
  const rgb = hexToRgb(bright);
  root.setProperty('--bm-ring', `rgba(${rgb}, .25)`);
  root.setProperty('--bm-glow', `radial-gradient(circle, rgba(${rgb}, .18) 0%, rgba(${rgb}, 0) 70%)`);
}

let _accent: AccentColor = getInitialAccent();

interface AccentColorContextValue {
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
});

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [accent, setAccentState] = useState<AccentColor>(_accent);

  // Re-applies whenever the accent choice OR the resolved light/dark theme changes, so the
  // correct bright variant is always in effect regardless of which changed.
  useEffect(() => {
    applyAccent(accent, theme);
  }, [accent, theme]);

  function setAccent(next: AccentColor) {
    _accent = next;
    setAccentState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — accent still applies for this page load, just won't persist.
    }
  }

  return (
    <AccentColorContext.Provider value={{ accent, setAccent }}>
      {children}
    </AccentColorContext.Provider>
  );
}

export function useAccentColor(): AccentColorContextValue {
  return useContext(AccentColorContext);
}
