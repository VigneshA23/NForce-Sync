import { createContext, useContext, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';

export interface AccessibilitySettings {
  highContrast: boolean;
  enhancedFocus: boolean;
  reduceMotion: boolean;
  underlineLinks: boolean;
  statusCues: boolean;
}

export type AccessibilityKey = keyof AccessibilitySettings;

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  highContrast: false,
  enhancedFocus: false,
  reduceMotion: false,
  underlineLinks: false,
  statusCues: false,
};

// Each setting is stored under its own key and mirrored to a data attribute on <html>, which
// index.css keys off — same shape as density.tsx / fontSize.tsx.
const META: Record<AccessibilityKey, { storage: string; attr: string }> = {
  highContrast:   { storage: 'nf-a11y-high-contrast',   attr: 'data-high-contrast' },
  enhancedFocus:  { storage: 'nf-a11y-enhanced-focus',  attr: 'data-enhanced-focus' },
  reduceMotion:   { storage: 'nf-a11y-reduce-motion',   attr: 'data-reduce-motion' },
  underlineLinks: { storage: 'nf-a11y-underline-links', attr: 'data-underline-links' },
  statusCues:     { storage: 'nf-a11y-status-cues',     attr: 'data-status-cues' },
};

const KEYS = Object.keys(META) as AccessibilityKey[];

function readInitial(): AccessibilitySettings {
  const out = { ...DEFAULT_ACCESSIBILITY };
  for (const key of KEYS) {
    try {
      const stored = localStorage.getItem(META[key].storage);
      if (stored === 'true' || stored === 'false') out[key] = stored === 'true';
    } catch {
      // localStorage unavailable — default.
    }
  }
  return out;
}

function applyAll(settings: AccessibilitySettings) {
  const root = document.documentElement;
  for (const key of KEYS) root.setAttribute(META[key].attr, String(settings[key]));
}

// Module-level — applied before React renders so a saved preference is in effect from the first
// paint and survives reloads, mirroring fontSize.tsx / density.tsx.
let _settings: AccessibilitySettings = readInitial();
applyAll(_settings);

interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  setSetting: (key: AccessibilityKey, value: boolean) => void;
  reset: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  settings: DEFAULT_ACCESSIBILITY,
  setSetting: () => {},
  reset: () => {},
});

function persist(key: AccessibilityKey, value: boolean) {
  try {
    localStorage.setItem(META[key].storage, String(value));
  } catch {
    // localStorage unavailable — setting still applies for this page load, just won't persist.
  }
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(_settings);

  useEffect(() => {
    applyAll(settings);
  }, [settings]);

  function setSetting(key: AccessibilityKey, value: boolean) {
    _settings = { ..._settings, [key]: value };
    setSettings(_settings);
    persist(key, value);
  }

  function reset() {
    _settings = { ...DEFAULT_ACCESSIBILITY };
    setSettings(_settings);
    for (const key of KEYS) persist(key, false);
  }

  return (
    <AccessibilityContext.Provider value={{ settings, setSetting, reset }}>
      <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  return useContext(AccessibilityContext);
}
