import React from "react";

/**
 * GlobalLoader
 * -------------
 * Branded, app-wide loading indicator for NForce Sync.
 * Uses the existing design-system CSS custom properties
 * (--brand, --brand-bright, --shell, --line, --txt-mut) rather than
 * hardcoded colors, so it stays in sync with the crimson-on-charcoal
 * theme automatically if those tokens ever change.
 *
 * Usage (global, route-level):
 * ------------------------------------------------------
 * // In your top-level router / App shell:
 * import { GlobalLoader } from "./components/GlobalLoader";
 * import { Suspense } from "react";
 *
 * <Suspense fallback={<GlobalLoader />}>
 *   <RouterOutlet />
 * </Suspense>
 * ------------------------------------------------------
 *
 * Props:
 *  - label: optional status text under the mark (defaults to "Loading...")
 *  - subLabel: optional smaller secondary line under the label
 *    (defaults to "Please wait while your data loads."; pass "" to omit it)
 *  - fullScreen: covers the viewport with a charcoal scrim (default true)
 *  - compact: smaller mark + no forced min-height, for embedding inside a
 *    small scoped panel (a list, a side panel) instead of a full page/route.
 *    Only meaningful when fullScreen is false.
 */

interface GlobalLoaderProps {
  label?: string;
  subLabel?: string;
  fullScreen?: boolean;
  compact?: boolean;
}

export const GlobalLoader: React.FC<GlobalLoaderProps> = ({
  label = "Loading...",
  subLabel = "Please wait while your data loads.",
  fullScreen = true,
  compact = false,
}) => {
  const containerStyle: React.CSSProperties = fullScreen
    ? {
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        background: "color-mix(in srgb, var(--shell) 92%, transparent)",
        backdropFilter: "blur(2px)",
        zIndex: 9999,
      }
    : {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? "8px" : "12px",
        padding: compact ? "16px" : "24px",
        minHeight: compact ? 140 : "50vh",
      };

  const markSize = compact ? 36 : 72;

  return (
    <div style={containerStyle} role="status" aria-live="polite" aria-label={label}>
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        {/* Static track ring, using the --line token */}
        <circle
          cx="36"
          cy="36"
          r="28"
          stroke="var(--line)"
          strokeWidth="4"
          fill="none"
          opacity="0.35"
        />

        {/* Rotating crimson arc — the animated "brand" element */}
        <circle
          cx="36"
          cy="36"
          r="28"
          stroke="var(--brand)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="44 132"
          className="gl-arc"
        />

        {/* Two-arrow sync glyph at center, echoing the "Sync" identity */}
        <g className="gl-pulse">
          <path
            d="M25 30a11 11 0 0 1 18-8.5l3-3"
            stroke="var(--brand)"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M43 24l4 -1 1 4.5"
            stroke="var(--brand)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M47 42a11 11 0 0 1-18 8.5l-3 3"
            stroke="var(--brand)"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M29 48l-4 1-1 -4.5"
            stroke="var(--brand)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      </svg>

      {label && (
        <span
          style={{
            fontFamily:
              '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
            fontSize: compact ? "12px" : "13px",
            letterSpacing: "0.02em",
            color: "var(--brand-bright)",
          }}
        >
          {label}
        </span>
      )}

      {subLabel && (
        <span
          style={{
            fontFamily:
              '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
            fontSize: compact ? "11px" : "12px",
            letterSpacing: "0.01em",
            color: "var(--txt-mut)",
            marginTop: compact ? 0 : "-8px",
          }}
        >
          {subLabel}
        </span>
      )}

      <style>{`
        .gl-arc {
          transform-origin: 36px 36px;
          animation: gl-rotate 1.1s linear infinite;
        }
        .gl-pulse {
          animation: gl-fade 1.6s ease-in-out infinite;
          transform-origin: 36px 36px;
        }
        @keyframes gl-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes gl-fade {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
        @media (prefers-reduced-motion: reduce) {
          .gl-arc, .gl-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};

export default GlobalLoader;
