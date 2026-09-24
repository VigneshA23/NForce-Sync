import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, TrendingUp } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useGreeting, useLiveClock } from '../../lib/useGreeting';
import { fetchProfile } from '../../api/profile';
import { resolveIllustrationKey } from '../../lib/illustration';
import { HeroIllustration } from './illustrations';
import { HeroSparkles } from './HeroSparkles';

function MiniCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 10, padding: '10px 14px', minWidth: 0,
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: 'color-mix(in srgb, var(--brand-bright) 20%, #000)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--brand-bright)',
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

/**
 * Personalized hero banner shown at the top of every role's dashboard. Greeting, date, and time
 * are all derived from the browser clock / the real logged-in user — never hardcoded, never a
 * sample name. `subtitle` lets each dashboard vary the supporting line; everything else is
 * identical across roles per the design spec.
 */
export function HeroBanner({ subtitle = "Stay focused, you're making great progress!" }: { subtitle?: string }) {
  const { user } = useAuth();
  const displayName = user?.name || 'there';
  const greeting = useGreeting(displayName);
  const { date, time } = useLiveClock();

  // Same ['profile', email] query key Shell.tsx already warms for the avatar photo — reuses
  // that cache entry rather than issuing a second network call for gender.
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.email],
    queryFn: fetchProfile,
    staleTime: 300_000,
    enabled: !!user,
  });

  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        borderRadius: 14, marginBottom: 20,
        // Reference look, layered back-to-front:
        //  1. the glow: a controlled-saturation red/crimson ellipse anchored right of center
        //     (behind the illustration), sized so it never reaches the left third — the
        //     greeting text and info pills sit on pure near-black, no pink bleed
        //  2. a near-black/dark-maroon base filling the rest of the card
        // (the diagonal swirl-stripe texture is a separate absolutely-positioned layer below,
        // masked to the glow's own footprint so it doesn't show over the dark left side)
        background: [
          'radial-gradient(ellipse 42% 130% at 84% 58%, var(--brand-bright) 0%, var(--brand) 26%, var(--hero-corner) 58%, transparent 88%)',
          'linear-gradient(160deg, #0A0607 0%, #150506 100%)',
        ].join(', '),
        // Vignette — slight darkening at every edge so the glow reads as contained inside the
        // card rather than spilling to its border.
        boxShadow: 'inset 0 0 46px rgba(0,0,0,.5)',
        border: '1px solid color-mix(in srgb, var(--brand-bright) 26%, transparent)',
        padding: '24px 28px',
        // A definite height (not just flex-content-driven "auto") so the illustration panel,
        // which is absolutely positioned with top:0/bottom:0, always gets a real pixel height
        // to fill — without this, percentage-based sizing further down the illustration's own
        // tree has nothing definite to resolve against and can render short/letterboxed.
        minHeight: 210,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
      }}
      className="nf-hero"
    >
      <HeroSparkles />
      <div style={{ flex: 1, minWidth: 0, paddingRight: 220, position: 'relative', zIndex: 1 }}>
        <h1 style={{
          margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#fff',
          fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
          letterSpacing: '-0.01em',
        }}>
          {greeting}
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'rgba(255,255,255,.82)' }}>{subtitle}</p>

        <div className="nf-hero-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <MiniCard icon={<CalendarDays size={15} />} label="Today" value={date} />
          <MiniCard icon={<Clock size={15} />} label="Current Time" value={time} />
          <MiniCard
            icon={<TrendingUp size={15} />}
            label="Small steps, big progress!"
            value="Keep up the great work!"
          />
        </div>
      </div>

      {/* Bleeds to the card's own edges (right/top/bottom), overlapping the outer padding, so it
          reads as a full illustration panel rather than a small inset thumbnail. Omitted entirely
          (no placeholder graphic) when the profile has no recognized gender. */}
      {resolveIllustrationKey(profile?.gender) !== 'neutral' && (
        <div className="nf-hero-illustration" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 260, zIndex: 1 }}>
          <HeroIllustration gender={profile?.gender} />
        </div>
      )}
    </div>
  );
}
