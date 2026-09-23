import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
export type ThemeMode = Theme | 'auto';

const STORAGE_KEY = 'nf-theme';

function prefersLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

function resolveAppliedTheme(mode: ThemeMode): Theme {
  if (mode === 'auto') return prefersLight() ? 'light' : 'dark';
  return mode;
}

function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through to OS preference.
  }
  return prefersLight() ? 'light' : 'dark';
}

// Module-level variables — survive Provider unmount/remount within the same page load;
// localStorage (below) is what survives an actual page refresh.
let _mode: ThemeMode = getInitialMode();
let _theme: Theme = resolveAppliedTheme(_mode);

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  // Brief class enables CSS transitions only during the theme swap
  html.classList.add('nf-theme-transitioning');
  setTimeout(() => html.classList.remove('nf-theme-transitioning'), 200);
}

// Apply before React renders to avoid flash
applyTheme(_theme);

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  mode: 'dark',
  toggleTheme: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(_mode);
  const [theme, setTheme] = useState<Theme>(_theme);

  function persist(nextMode: ThemeMode) {
    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // localStorage unavailable — mode still applies for this page load, just won't persist.
    }
  }

  function applyMode(nextMode: ThemeMode) {
    const nextTheme = resolveAppliedTheme(nextMode);
    _mode = nextMode;
    _theme = nextTheme;
    applyTheme(nextTheme);
    setModeState(nextMode);
    setTheme(nextTheme);
    persist(nextMode);
  }

  function setMode(nextMode: ThemeMode) {
    applyMode(nextMode);
  }

  function toggleTheme() {
    applyMode(theme === 'dark' ? 'light' : 'dark');
  }

  // Live-update while in "auto" mode if the OS preference changes without a page reload.
  useEffect(() => {
    if (mode !== 'auto') return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(prefers-color-scheme: light)');
    } catch {
      return;
    }
    const onChange = () => {
      const nextTheme = resolveAppliedTheme('auto');
      _theme = nextTheme;
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
