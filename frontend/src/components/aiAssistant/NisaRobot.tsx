import type { CSSProperties } from 'react';
import robot from '../../assets/nisa-robot.png';

/** The robot has transparent margins in its 340px frame; OneHR crops them by drawing the image
 *  1/0.865 (≈115.6%) of its box and pulling it up/left so the face fills the disc. Same numbers
 *  here so the NISA robot reads identically zoomed-in. */
const SCALE = 0.865;
const SIZE = `${(100 / SCALE).toFixed(2)}%`;
const OFFSET = `${((-10.6 / (SCALE * 100)) * 100).toFixed(2)}%`;

/** NISA's robot on a brand-colored disc, filling its parent. Image-only: no behavior. */
export function NisaRobot({ style }: { style?: CSSProperties }) {
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', ...style }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 25%, var(--brand-bright), var(--brand) 62%, var(--brand-deep, var(--brand)))',
        }}
      />
      <img
        src={robot}
        alt=""
        draggable={false}
        style={{ position: 'absolute', left: OFFSET, top: OFFSET, width: SIZE, height: SIZE, maxWidth: 'none' }}
      />
    </span>
  );
}
