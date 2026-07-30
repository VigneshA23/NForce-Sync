import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  /** Sticky footer (e.g. Save/Cancel) rendered outside the scrollable body — never clipped. */
  footer?: React.ReactNode;
}

export function Modal({ open, title, onClose, children, width = 440, footer }: ModalProps) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock scrolling behind the dialog. The page scrolls on the document (Shell's
  // <main> sets no overflow), so `body` is the element to freeze. Save/restore the
  // previous values rather than clearing them, so a dialog stacked on top of
  // another leaves the page still locked when only the inner one closes.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    // Hiding the scrollbar reclaims its width and would shift the page underneath;
    // pad by exactly that much to keep it visually still. Resolves to 0 for an
    // already-locked body (nested dialog) or an overlay scrollbar, so it can't double up.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
            onClick={onClose}
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.65)',
              backdropFilter: 'blur(3px)',
              zIndex: 900,
            }}
          />
          {/* Panel wrapper — flex-centers the panel. Centering must NOT use
              `transform` on the panel itself: framer-motion owns that property
              while animating scale/y and overwrites it (to `none` once the enter
              animation settles), which would strip a `translate(-50%,-50%)` and
              leave the panel's top-left corner at the viewport centre.
              `pointerEvents: none` keeps backdrop click-to-close working. */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 901,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              pointerEvents: 'none',
            }}
          >
          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 4 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
            style={{
              width: `min(${width}px, 100%)`,
              maxHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              boxShadow: '0 24px 60px rgba(0,0,0,.7)',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            {/* Header — sticky, never scrolls */}
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <h2
                id="modal-title"
                style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--txt)',
                  margin: 0,
                }}
              >
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--txt-dim)',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 4,
                  transition: 'color 0.14s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--txt)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--txt-dim)')}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {/* Body — scrolls internally so footer buttons stay reachable when content exceeds viewport height */}
            <div style={{
              padding: '20px', flex: 1, minHeight: 0, overflowY: 'auto',
              // Don't hand a wheel gesture off to an ancestor scroller once this
              // region hits its top/bottom edge.
              overscrollBehavior: 'contain',
            }}>{children}</div>
            {/* Footer — sticky, never scrolls or gets clipped */}
            {footer && (
              <div
                style={{
                  flexShrink: 0,
                  padding: '14px 20px',
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  gap: 10,
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
