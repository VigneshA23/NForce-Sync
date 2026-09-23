import { createContext, useContext, useEffect, useState } from 'react';

export type FontSize = 'Small' | 'Default' | 'Large';

const STORAGE_KEY = 'nf-font-size';
const DEFAULT_FONT_SIZE: FontSize = 'Default';
const FONT_SIZES: FontSize[] = ['Small', 'Default', 'Large'];

function getInitialFontSize(): FontSize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (FONT_SIZES as string[]).includes(stored)) return stored as FontSize;
  } catch {
    // localStorage unavailable — default.
  }
  return DEFAULT_FONT_SIZE;
}

function applyFontSize(fontSize: FontSize) {
  document.documentElement.setAttribute('data-font-size', fontSize);
}

// Module-level — applied before React renders to avoid a flash of the default size, mirroring
// theme.tsx's/density.tsx's own pattern.
let _fontSize: FontSize = getInitialFontSize();
applyFontSize(_fontSize);

interface FontSizeContextValue {
  fontSize: FontSize;
  setFontSize: (fontSize: FontSize) => void;
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSize: DEFAULT_FONT_SIZE,
  setFontSize: () => {},
});

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(_fontSize);

  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  function setFontSize(next: FontSize) {
    _fontSize = next;
    setFontSizeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — size still applies for this page load, just won't persist.
    }
  }

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): FontSizeContextValue {
  return useContext(FontSizeContext);
}
