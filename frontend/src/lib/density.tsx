import { createContext, useContext, useEffect, useState } from 'react';

export type Density = 'Compact' | 'Comfortable' | 'Spacious';

const STORAGE_KEY = 'nf-density';
const DEFAULT_DENSITY: Density = 'Comfortable';
const DENSITIES: Density[] = ['Compact', 'Comfortable', 'Spacious'];

function getInitialDensity(): Density {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (DENSITIES as string[]).includes(stored)) return stored as Density;
  } catch {
    // localStorage unavailable — default.
  }
  return DEFAULT_DENSITY;
}

function applyDensity(density: Density) {
  document.documentElement.setAttribute('data-density', density);
}

// Module-level — applied before React renders to avoid a flash of the default density,
// mirroring theme.tsx's _theme/applyTheme pattern.
let _density: Density = getInitialDensity();
applyDensity(_density);

interface DensityContextValue {
  density: Density;
  setDensity: (density: Density) => void;
}

const DensityContext = createContext<DensityContextValue>({
  density: DEFAULT_DENSITY,
  setDensity: () => {},
});

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>(_density);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  function setDensity(next: Density) {
    _density = next;
    setDensityState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — density still applies for this page load, just won't persist.
    }
  }

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  return useContext(DensityContext);
}
