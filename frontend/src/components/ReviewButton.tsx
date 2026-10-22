import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface ReviewButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  /** Adds a trailing chevron - for a Review button that opens a menu rather than a modal. */
  showChevron?: boolean;
}

/** The brand-filled "Review" button shared by the Approvals rows. */
export const ReviewButton = forwardRef<HTMLButtonElement, ReviewButtonProps>(
  function ReviewButton({ showChevron = false, children = 'Review', type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        {...rest}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff', cursor: 'pointer',
        }}
      >
        {children}
        {showChevron && <ChevronDown size={13} aria-hidden="true" />}
      </button>
    );
  },
);
