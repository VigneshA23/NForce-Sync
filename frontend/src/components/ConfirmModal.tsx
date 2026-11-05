import { Modal } from './Modal';
import { btnDanger, btnNeutral } from '../lib/uiStyles';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  isPending?: boolean;
}

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
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          {/* OneHR dialog order: dismiss on the left, the action on the right. */}
          <button onClick={onClose} className="nf-btn nf-btn--neutral" style={btnNeutral}>Cancel</button>
          <button onClick={onConfirm} disabled={isPending} className="nf-btn nf-btn--danger" style={btnDanger}>
            {isPending ? 'Working…' : confirmLabel}
          </button>
        </div>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7 }}>{message}</div>
    </Modal>
  );
}
