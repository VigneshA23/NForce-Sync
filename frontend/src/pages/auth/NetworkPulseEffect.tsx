import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulsePhase: number;
}

interface Packet {
  fromIdx: number;
  toIdx: number;
  t: number;
  speed: number;
}

interface Ring {
  x: number;
  y: number;
  t: number;
}

const NODE_COUNT = 60;
const MAX_LINK_DIST = 210;
const MAX_PACKETS = 16;
const PACKET_SPAWN_INTERVAL = 0.15;
const MOUSE_INFLUENCE_RADIUS = 260;
const RING_INTERVAL = 2.6;

interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * Keep-clear zones: just the headline's own bounding box (it's vertically
 * centered, not the full hero height) and the card's own bounding box — small,
 * localized boxes, not full-height columns, so nodes still spread across the
 * entire screen (top/bottom/sides) instead of being squeezed into a gutter.
 */
function getZones(width: number, height: number): { text: Rect; card: Rect } {
  return {
    text: { x0: 0, y0: height * 0.26, x1: Math.min(660, width * 0.52), y1: height * 0.74 },
    card: { x0: width * 0.64, y0: height * 0.22, x1: Math.min(width, width * 0.64 + 460), y1: height * 0.8 },
  };
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}

function pickSpawnPosition(width: number, height: number, zones: { text: Rect; card: Rect }) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    if (!inRect(x, y, zones.text) && !inRect(x, y, zones.card)) return { x, y };
  }
  // Rare fallback after repeated misses — still a fully random point anywhere
  // on screen, never forced into a fixed line/gutter.
  return { x: Math.random() * width, y: Math.random() * height };
}

function repelFromRect(n: Node, rect: Rect, strength: number, dt: number) {
  if (!inRect(n.x, n.y, rect)) return;
  const dLeft = n.x - rect.x0;
  const dRight = rect.x1 - n.x;
  const dTop = n.y - rect.y0;
  const dBottom = rect.y1 - n.y;
  const minD = Math.min(dLeft, dRight, dTop, dBottom);
  if (minD === dLeft) n.vx -= strength * dt;
  else if (minD === dRight) n.vx += strength * dt;
  else if (minD === dTop) n.vy -= strength * dt;
  else n.vy += strength * dt;
}

function buildNodes(width: number, height: number): Node[] {
  const zones = getZones(width, height);
  const nodes: Node[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const { x, y } = pickSpawnPosition(width, height, zones);
    nodes.push({
      x, y,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7,
      radius: 1.8 + Math.random() * 2.0,
      pulsePhase: Math.random() * Math.PI * 2,
    });
  }
  return nodes;
}

function findLinks(nodes: Node[]): Array<[number, number, number]> {
  const links: Array<[number, number, number]> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MAX_LINK_DIST) links.push([i, j, dist]);
    }
  }
  return links;
}

export function NetworkPulseEffect() {
  const reduced = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = wrapper.clientWidth;
    let height = wrapper.clientHeight;
    const nodes = buildNodes(width, height);

    function resize() {
      if (!wrapper || !canvas) return;
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function drawStatic() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const links = findLinks(nodes);
      for (const [i, j, dist] of links) {
        const a = nodes[i], b = nodes[j];
        const opacity = (1 - dist / MAX_LINK_DIST) * 0.3;
        ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const n of nodes) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (reduced) {
      drawStatic();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }

    const mouse = { x: -9999, y: -9999, active: false };
    const mouseGlow = { x: -9999, y: -9999, opacity: 0 };
    function handleMouseMove(e: MouseEvent) {
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) {
        mouse.active = false;
        return;
      }
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    }
    window.addEventListener('mousemove', handleMouseMove);

    let visible = !document.hidden;
    function handleVisibility() { visible = !document.hidden; }
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('resize', resize);

    const packets: Packet[] = [];
    const rings: Ring[] = [];
    let spawnTimer = 0;
    let ringTimer = 0;
    let rafId = 0;
    let lastTime = performance.now();

    function tick(now: number) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (!visible || !ctx) return;

      // Drift nodes slowly, bounce off edges, gently repel from the cursor and
      // from the text/card keep-clear zones.
      const zones = getZones(width, height);
      for (const n of nodes) {
        repelFromRect(n, zones.text, 18, dt);
        repelFromRect(n, zones.card, 10, dt);
        if (mouse.active) {
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_INFLUENCE_RADIUS && dist > 0.01) {
            const force = (1 - dist / MOUSE_INFLUENCE_RADIUS) * 16;
            n.vx += (dx / dist) * force * dt;
            n.vy += (dy / dist) * force * dt;
          }
        }
        n.vx *= 0.98;
        n.vy *= 0.98;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        n.x = Math.max(0, Math.min(width, n.x));
        n.y = Math.max(0, Math.min(height, n.y));
      }

      // Smoothly follow the mouse-glow spotlight toward the cursor.
      if (mouse.active) {
        mouseGlow.x += (mouse.x - mouseGlow.x) * 0.08;
        mouseGlow.y += (mouse.y - mouseGlow.y) * 0.08;
        mouseGlow.opacity += (1 - mouseGlow.opacity) * 0.06;
      } else {
        mouseGlow.opacity += (0 - mouseGlow.opacity) * 0.04;
      }

      const links = findLinks(nodes);

      ctx.clearRect(0, 0, width, height);

      // Soft spotlight that follows the cursor across the whole hero.
      if (mouseGlow.opacity > 0.01) {
        const glow = ctx.createRadialGradient(mouseGlow.x, mouseGlow.y, 0, mouseGlow.x, mouseGlow.y, 340);
        glow.addColorStop(0, `rgba(228,55,61,${0.12 * mouseGlow.opacity})`);
        glow.addColorStop(0.5, `rgba(255,255,255,${0.05 * mouseGlow.opacity})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }

      // Links — brighten and warm up in color near the cursor.
      for (const [i, j, dist] of links) {
        const a = nodes[i], b = nodes[j];
        let opacity = (1 - dist / MAX_LINK_DIST) * 0.32;
        let warm = 0;
        if (mouse.active) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const md = Math.sqrt((mx - mouse.x) ** 2 + (my - mouse.y) ** 2);
          if (md < MOUSE_INFLUENCE_RADIUS) {
            const t = 1 - md / MOUSE_INFLUENCE_RADIUS;
            opacity += t * 0.45;
            warm = t;
          }
        }
        const channel = Math.round(255 - warm * 145);
        ctx.strokeStyle = `rgba(255,${channel},${channel},${Math.min(opacity, 0.75)})`;
        ctx.lineWidth = 1 + warm * 0.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes — soft glowing dots with a breathing pulse and a faint red core.
      for (const n of nodes) {
        n.pulsePhase += dt * 1.4;
        const pulse = 0.5 + 0.5 * Math.sin(n.pulsePhase);
        const r = n.radius * (1 + pulse * 0.5);
        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
        gradient.addColorStop(0, `rgba(255,255,255,${0.55 + pulse * 0.3})`);
        gradient.addColorStop(0.35, `rgba(255,210,210,${0.22 + pulse * 0.12})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.7 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Expanding radar-ping rings from a random node — "live activity" feel.
      ringTimer += dt;
      if (ringTimer >= RING_INTERVAL) {
        ringTimer = 0;
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        rings.push({ x: n.x, y: n.y, t: 0 });
      }
      for (let k = rings.length - 1; k >= 0; k--) {
        const ring = rings[k];
        ring.t += dt * 0.6;
        if (ring.t >= 1) { rings.splice(k, 1); continue; }
        const radius = ring.t * 90;
        const opacity = (1 - ring.t) * 0.35;
        ctx.strokeStyle = `rgba(228,55,61,${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Spawn new data packets travelling along existing links.
      spawnTimer += dt;
      if (spawnTimer >= PACKET_SPAWN_INTERVAL && packets.length < MAX_PACKETS && links.length > 0) {
        spawnTimer = 0;
        const [i, j] = links[Math.floor(Math.random() * links.length)];
        packets.push({
          fromIdx: Math.random() < 0.5 ? i : j,
          toIdx: Math.random() < 0.5 ? j : i,
          t: 0,
          speed: 0.85 + Math.random() * 0.75,
        });
      }

      // Draw + advance packets (brand-red "data flowing" pulses).
      for (let k = packets.length - 1; k >= 0; k--) {
        const p = packets[k];
        p.t += p.speed * dt;
        if (p.t >= 1) { packets.splice(k, 1); continue; }
        const from = nodes[p.fromIdx];
        const to = nodes[p.toIdx];
        if (!from || !to) { packets.splice(k, 1); continue; }
        const x = from.x + (to.x - from.x) * p.t;
        const y = from.y + (to.y - from.y) * p.t;
        const fade = Math.sin(p.t * Math.PI);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gradient.addColorStop(0, `rgba(228,55,61,${1 * fade})`);
        gradient.addColorStop(0.5, `rgba(228,55,61,${0.5 * fade})`);
        gradient.addColorStop(1, 'rgba(228,55,61,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,235,235,${fade})`;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [reduced]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
