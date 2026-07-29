import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';

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

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: `min(${width}px, calc(100vw - 32px))`,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              boxShadow: '0 24px 60px rgba(0,0,0,.7)',
              zIndex: 901,
              overflow: 'hidden',
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
            {/* Body — the only scrollable region */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: '1 1 auto' }}>{children}</div>
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
        </>
      )}
    </AnimatePresence>
  );
}
