import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, X } from 'lucide-react';

// Fix 5: Matches OneHR's ToastContext interface exactly
// - success auto-dismisses in 3 s, error in 6 s (same as OneHR)
// - top-right positioning (per spec)
// - dismiss button on each toast
// - dark theme colors using Sync CSS tokens

type ToastKind = 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  /** OneHR-compatible primary API */
  showToast: (kind: ToastKind, message: string) => void;
  /** Backward-compat shorthand used in UserManagement */
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, kind }]);
    const delay = kind === 'success' ? 3000 : 6000;
    timers.current.set(id, setTimeout(() => dismiss(id), delay));
  }, [dismiss]);

  // Backward-compat alias: show(message) → success, show(message, 'error') → error
  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    showToast(kind, message);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, show }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxWidth: 380,
          width: '100%',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              role="alert"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                background: '#1E2128',
                border: `1px solid ${t.kind === 'success' ? 'rgba(47,182,124,.35)' : 'rgba(228,55,61,.35)'}`,
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,.6)',
                color: '#E8EAED',
                fontSize: 13,
                minWidth: 260,
                maxWidth: 380,
                pointerEvents: 'auto',
              }}
            >
              {t.kind === 'success'
                ? <CheckCircle size={15} style={{ color: '#2FB67C', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                : <XCircle size={15} style={{ color: '#E4373D', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />}
              <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#6B7280',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}
