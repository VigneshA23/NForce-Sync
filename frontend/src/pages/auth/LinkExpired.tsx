import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { LoginHeroBackdrop } from './LoginHeroBackdrop';

/** Where "Request new link" leads: the one-field Email form (Forgot, in its 'newLink' variant). */
export const REQUEST_NEW_LINK_PATH = '/request-new-link';

/**
 * The content of the dedicated "Link expired" page. Shown when a reset link is opened after its
 * expiry, was already used, was replaced by a newer one, or is unknown — and when the temporary
 * password itself has expired. Kept free of layout/router hooks so it can be rendered on its own.
 */
export function LinkExpiredCard({ onRequestNew }: { onRequestNew: () => void }) {
  return (
    <div role="alert" aria-live="polite">
      <div style={accentLineStyle} />
      <div style={iconWrapStyle} aria-hidden="true">
        <Clock size={22} color="#B1111E" />
      </div>
      <h1 style={headingStyle}>This link has expired</h1>
      <p style={bodyStyle}>
        Your password reset link is no longer valid. Please request a new link.
      </p>
      <button
        type="button"
        onClick={onRequestNew}
        className="nf-submit-btn"
        style={buttonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
      >
        Request new link
      </button>
    </div>
  );
}

export default function LinkExpired() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  return (
    <AuthLayout
      leftHeadline="Centralized Work & Utilization Management"
      showStats
      heroBackdrop={<LoginHeroBackdrop />}
      cardTheme="light"
      heroFullBleed
      hideFeatureBadges
      hideEyebrow
    >
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 10 }}
        animate={reduced ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <LinkExpiredCard onRequestNew={() => navigate(REQUEST_NEW_LINK_PATH)} />
      </motion.div>
    </AuthLayout>
  );
}

const accentLineStyle: React.CSSProperties = {
  width: 40, height: 2, background: '#E4373D', borderRadius: 1, marginBottom: 20,
};

const iconWrapStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(228,55,61,0.08)', border: '1px solid rgba(228,55,61,0.22)', marginBottom: 16,
};

const headingStyle: React.CSSProperties = {
  fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
  fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: '#111827', margin: '0 0 10px',
};

const bodyStyle: React.CSSProperties = {
  fontSize: 14, color: '#4B5563', lineHeight: 1.6, margin: '0 0 28px',
};

const buttonStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '13px 16px', background: '#E4373D', border: 'none', borderRadius: 8, color: '#fff',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.14s, transform 0.14s',
  fontFamily: 'Inter, sans-serif', letterSpacing: '0.01em',
};

const buttonHoverStyle: React.CSSProperties = {
  ...buttonStyle, background: '#C82026', transform: 'translateY(-1px)',
};
