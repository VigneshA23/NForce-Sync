import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '../lib/theme';
import { useAccentColor, ACCENT_SWATCHES, type AccentColor } from '../lib/accentColor';
import { useDensity, type Density } from '../lib/density';
import { useFontSize, type FontSize } from '../lib/fontSize';
import { useAccessibility, type AccessibilityKey } from '../lib/accessibility';
import { Card } from '../components/KpiCard';

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{children}</h2>
  );
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--txt-mut)' }}>{children}</p>
  );
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px', borderRadius: 8,
        border: active ? '1.5px solid var(--brand)' : '1px solid var(--line)',
        background: active ? 'color-mix(in srgb, var(--brand) 10%, var(--raised2))' : 'var(--raised2)',
        color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

function ToggleSwitch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: 'var(--txt-mut)', marginTop: 2 }}>{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          width: 38, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
          border: 'none', cursor: 'pointer',
          background: checked ? 'var(--brand)' : 'var(--line2)',
          transition: 'background 120ms',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 120ms', boxShadow: '0 1px 2px rgba(0,0,0,.3)',
        }} />
      </button>
    </div>
  );
}

const ACCESSIBILITY_TOGGLES: { key: AccessibilityKey; title: string; label: string; hint: string }[] = [
  { key: 'highContrast',   title: 'Contrast',       label: 'High contrast',                    hint: 'Stronger text, borders and status colors for easier reading.' },
  { key: 'enhancedFocus',  title: 'Keyboard focus', label: 'Enhanced focus outline',           hint: 'A thicker, two-tone outline around whatever you tab to.' },
  { key: 'reduceMotion',   title: 'Motion',         label: 'Reduce motion',                    hint: 'Turn off animations and transitions across the app.' },
  { key: 'underlineLinks', title: 'Links',          label: 'Underline links',                  hint: "Underline text links so they don't rely on color alone." },
  { key: 'statusCues',     title: 'Color vision',   label: 'Color-blind friendly status cues', hint: 'Add icons to status colors and use a red/green-safe palette.' },
];

const SELECT_STYLE: React.CSSProperties = {
  width: '100%', maxWidth: 280, boxSizing: 'border-box',
  background: 'var(--raised)', border: '1px solid var(--line2)',
  borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--txt)', outline: 'none',
  fontFamily: 'Inter, sans-serif',
};

const DISPLAY_MODES: { key: ThemeMode; label: string; icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }> }[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark',  label: 'Dark',  icon: Moon },
  { key: 'auto',  label: 'Auto',  icon: Monitor },
];

const DENSITIES: Density[] = ['Compact', 'Comfortable', 'Spacious'];
const FONT_SIZES: FontSize[] = ['Small', 'Default', 'Large'];

const TABS = ['Appearance', 'Accessibility'] as const;
type Tab = typeof TABS[number];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Preferences() {
  const navigate = useNavigate();
  const { mode, setMode } = useTheme();
  const { accent, setAccent } = useAccentColor();
  const { density, setDensity } = useDensity();
  const [tab, setTab] = useState<Tab>('Appearance');

  const { fontSize, setFontSize } = useFontSize();
  const { settings: a11y, setSetting, reset: resetAccessibility } = useAccessibility();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      <div>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--brand-bright)', fontSize: 12.5, padding: 0, marginBottom: 10,
          }}
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to Application
        </button>
        <h1 style={{ margin: 0, marginBottom: 4, fontSize: 20, fontWeight: 700, color: 'var(--txt)' }}>User Preferences</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-mut)' }}>Manage your personal appearance and accessibility settings.</p>
      </div>

      <div className="nf-r-preferences-layout" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Tab rail */}
        <div className="nf-r-preferences-rail" style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                textAlign: 'left', padding: '9px 12px', borderRadius: 6, border: 'none',
                background: tab === t ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'transparent',
                color: tab === t ? 'var(--brand-bright)' : 'var(--txt-mut)',
                fontSize: 13, fontWeight: tab === t ? 600 : 500, cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <Card style={{ flex: 1, minWidth: 0, padding: '22px 24px' }}>
          {tab === 'Appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              <div>
                <SectionTitle>Display mode</SectionTitle>
                <SectionHint>Choose how Sync looks to you. "Auto" follows your system setting.</SectionHint>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {DISPLAY_MODES.map(({ key, label, icon: Icon }) => (
                    <PillButton key={key} active={mode === key} onClick={() => setMode(key)}>
                      <Icon size={14} aria-hidden />
                      {label}
                      {mode === key && <Check size={14} style={{ color: 'var(--brand-bright)' }} aria-hidden />}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div>
                <SectionTitle>Theme color</SectionTitle>
                <SectionHint>Pick the accent color used across buttons, links, and highlights.</SectionHint>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(Object.entries(ACCENT_SWATCHES) as [AccentColor, typeof ACCENT_SWATCHES[AccentColor]][]).map(([key, swatch]) => (
                    <PillButton key={key} active={accent === key} onClick={() => setAccent(key)}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: swatch.brand, flexShrink: 0 }} />
                      {swatch.label}
                      {accent === key && <Check size={14} style={{ color: 'var(--brand-bright)' }} aria-hidden />}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div>
                <SectionTitle>Density</SectionTitle>
                <SectionHint>How tightly packed lists, tables, and cards should feel.</SectionHint>
                <select value={density} onChange={e => setDensity(e.target.value as Density)} style={SELECT_STYLE}>
                  {DENSITIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          {tab === 'Accessibility' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              <div>
                <SectionTitle>Text size</SectionTitle>
                <SectionHint>Adjust the base text size used across the app.</SectionHint>
                <select value={fontSize} onChange={e => setFontSize(e.target.value as FontSize)} style={SELECT_STYLE}>
                  {FONT_SIZES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              {ACCESSIBILITY_TOGGLES.map(({ key, title, label, hint }) => (
                <div key={key}>
                  <SectionTitle>{title}</SectionTitle>
                  <ToggleSwitch checked={a11y[key]} onChange={v => setSetting(key, v)} label={label} hint={hint} />
                </div>
              ))}

              <div>
                <button
                  type="button"
                  onClick={resetAccessibility}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line2)',
                    background: 'var(--raised2)', color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  }}
                >
                  Reset accessibility settings
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
