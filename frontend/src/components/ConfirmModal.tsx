import { Modal } from './Modal';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  isPending?: boolean;
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '9px 20px', background: 'var(--raised2)', border: '1px solid var(--line2)',
  borderRadius: 7, color: 'var(--txt)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

/** Shared "Are you sure?" confirmation dialog built on the base Modal — the reusable
 *  counterpart to the ConfirmModal copies duplicated locally in BusinessRules.tsx and
 *  OrganizationMasters.tsx. New confirm flows should import this instead of redefining one. */
export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel, isPending = false }: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button
            onClick={onConfirm}
            disabled={isPending}
            style={{
              padding: '9px 20px', background: 'rgba(228,55,61,.15)', border: '1px solid rgba(228,55,61,.4)',
              borderRadius: 7, color: 'var(--risk)', fontSize: 13, fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Working…' : confirmLabel}
          </button>
          <button onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7 }}>{message}</div>
    </Modal>
  );
}
