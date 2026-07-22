import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ open, title, onClose, children, width = 440 }: ModalProps) {
  const reduced = useReducedMotion();

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
              background: '#1E2128',
              border: '1px solid #2A2E37',
              borderRadius: 12,
              boxShadow: '0 24px 60px rgba(0,0,0,.7)',
              zIndex: 901,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #2A2E37',
              }}
            >
              <h2
                id="modal-title"
                style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#E8EAED',
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
                  color: '#6B7280',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 4,
                  transition: 'color 0.14s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#E8EAED')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#6B7280')}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {/* Body */}
            <div style={{ padding: '20px' }}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
