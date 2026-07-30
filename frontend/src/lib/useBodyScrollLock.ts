import { useEffect } from 'react';

// Locks page scroll to the modal while `active` is true, restoring the previous
// overflow value on close/unmount (rather than assuming '' — plays nice with any
// other code that may have already set body overflow).
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}
