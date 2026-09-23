import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '../lib/theme';
import { useAccentColor, ACCENT_SWATCHES, type AccentColor } from '../lib/accentColor';
import { useDensity, type Density } from '../lib/density';
import { useFontSize, type FontSize } from '../lib/fontSize';
import { Card } from '../components/KpiCard';

// ── Local, localStorage-only preferences (no backend endpoint yet — matches how theme/accent
// already persist). Each is read once at mount and written on change. ──────────────────────

function usePersistedBool(key: string, fallback: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? fallback : stored === 'true';
    } catch {
      return fallback;
    }
  });
  function set(next: boolean) {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // localStorage unavailable — preference still applies for this page load, just won't persist.
    }
  }
  return [value, set] as const;
}

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
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

const TABS = ['Appearance', 'Notifications', 'Accessibility'] as const;
type Tab = typeof TABS[number];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Preferences() {
  const navigate = useNavigate();
  const { mode, setMode } = useTheme();
  const { accent, setAccent } = useAccentColor();
  const { density, setDensity } = useDensity();
  const [tab, setTab] = useState<Tab>('Appearance');

  const [emailDigest, setEmailDigest]       = usePersistedBool('nf-notif-email', true);
  const [pushNotifs, setPushNotifs]         = usePersistedBool('nf-notif-push', true);
  const [announcements, setAnnouncements]   = usePersistedBool('nf-notif-announcements', true);
  const [approvalUpdates, setApprovalUpdates] = usePersistedBool('nf-notif-approvals', true);
  const [blockerUpdates, setBlockerUpdates] = usePersistedBool('nf-notif-blockers', true);

  const [reduceMotion, setReduceMotionState] = usePersistedBool('nf-reduce-motion', false);
  const { fontSize, setFontSize } = useFontSize();

  function toggleReduceMotion(next: boolean) {
    setReduceMotionState(next);
    document.documentElement.setAttribute('data-reduce-motion', String(next));
  }

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
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-mut)' }}>Manage your personal appearance, notifications, and accessibility settings.</p>
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

          {tab === 'Notifications' && (
            <div>
              <SectionTitle>Notifications</SectionTitle>
              <SectionHint>Choose what you'd like to be notified about. These preferences are saved to this browser only and aren't yet enforced by the server.</SectionHint>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <ToggleSwitch checked={emailDigest} onChange={setEmailDigest} label="Email digest" hint="Daily summary of activity relevant to you" />
                <div style={{ borderTop: '1px solid var(--line)' }} />
                <ToggleSwitch checked={pushNotifs} onChange={setPushNotifs} label="Push notifications" hint="Real-time alerts in this browser" />
                <div style={{ borderTop: '1px solid var(--line)' }} />
                <ToggleSwitch checked={announcements} onChange={setAnnouncements} label="Announcements" hint="Company-wide announcements and policy updates" />
                <div style={{ borderTop: '1px solid var(--line)' }} />
                <ToggleSwitch checked={approvalUpdates} onChange={setApprovalUpdates} label="Approval updates" hint="Status changes on requests you submitted or need to review" />
                <div style={{ borderTop: '1px solid var(--line)' }} />
                <ToggleSwitch checked={blockerUpdates} onChange={setBlockerUpdates} label="Blocker updates" hint="Replies and status changes on blockers you're involved in" />
              </div>
            </div>
          )}

          {tab === 'Accessibility' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              <div>
                <SectionTitle>Motion</SectionTitle>
                <SectionHint>Reduce animations and transitions app-wide, independent of your system setting.</SectionHint>
                <ToggleSwitch checked={reduceMotion} onChange={toggleReduceMotion} label="Reduce motion" />
              </div>
              <div>
                <SectionTitle>Text size</SectionTitle>
                <SectionHint>Adjust the base text size used across the app.</SectionHint>
                <select value={fontSize} onChange={e => setFontSize(e.target.value as FontSize)} style={SELECT_STYLE}>
                  {FONT_SIZES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
