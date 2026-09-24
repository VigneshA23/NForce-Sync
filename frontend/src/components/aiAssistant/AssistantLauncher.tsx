import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAssistantHealth } from '../../api/aiAssistant';
import { useAuth } from '../../lib/auth';
import { AssistantPanel } from './AssistantPanel';
import { LAUNCHER_Z, launcherButtonStyle } from './assistantStyles';
import { useDraggablePosition } from './useDraggablePosition';
import botAvatar from '../../assets/Bot Image.png';

/**
 * Mounted once inside Shell's root, after the main column — renders nothing unless
 * `enabled && indexReady` (a failed or negative health check hides it silently: a user who never
 * knew the feature existed has lost nothing). Rendered in-tree rather than portaled, since Sync's
 * font-size preference scales `#root` via CSS `zoom`, which a portal to `document.body` would miss.
 */
export function AssistantLauncher() {
  const { data: health } = useAssistantHealth();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const location = useLocation();
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const { position, dragging, dragHandlers, onClickCapture } = useDraggablePosition({
    storageKey: user ? `nfsync.ai.launcher.position.${user.id}` : null,
    defaultPosition: { right: 24, bottom: 24 },
    elementRef: bubbleRef,
  });

  if (!health || !health.enabled || !health.indexReady) {
    return null;
  }

  return (
    <>
      <div style={{ position: 'fixed', right: position.right, bottom: position.bottom, zIndex: LAUNCHER_Z }}>
        {!open && hovered && (
          <span
            style={{
              position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 10,
              padding: '5px 10px', borderRadius: 6, whiteSpace: 'nowrap',
              background: 'var(--raised)', border: '1px solid var(--line)', color: 'var(--txt)',
              fontSize: 12, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,.25)', pointerEvents: 'none',
            }}
          >
            Ask NISA
          </span>
        )}
        <button
          ref={bubbleRef}
          aria-label={open ? 'Close NISA — NForce Intelligent Sync Assistant' : 'Open NISA — NForce Intelligent Sync Assistant'}
          aria-expanded={open}
          onClickCapture={onClickCapture}
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          {...dragHandlers}
          style={{
            ...launcherButtonStyle,
            position: 'static',
            cursor: dragging ? 'grabbing' : 'pointer',
            touchAction: 'none',
            overflow: 'hidden',
            padding: 4,
          }}
        >
          <img
            src={botAvatar}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        </button>
      </div>
      <AssistantPanel
        open={open}
        onClose={() => setOpen(false)}
        currentPathname={location.pathname}
        health={health}
      />
    </>
  );
}
