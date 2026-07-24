import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useBlockers, type BlockedTaskDto } from '../../api/team';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1)  return 'less than 1h ago';
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function groupByProject(blockers: BlockedTaskDto[]): [string, BlockedTaskDto[]][] {
  const map = new Map<string, BlockedTaskDto[]>();
  for (const b of blockers) {
    const key = b.projectName ?? b.projectCode ?? 'Unassigned Project';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return Array.from(map.entries());
}

// ── primitives ─────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

// ── blocker card ───────────────────────────────────────────────────────────────

function BlockerCard({ b, isLast }: { b: BlockedTaskDto; isLast: boolean }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--line)',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 12,
    }}>
      <div>
        {/* Who / when */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'var(--raised2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: 'var(--txt-mut)',
          }}>
            {b.employeeName.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
          </div>
          <div>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)' }}>{b.employeeName}</span>
            {b.categoryName && (
              <span style={{ fontSize: 11, color: 'var(--txt-dim)', marginLeft: 8 }}>· {b.categoryName}</span>
            )}
          </div>
          <span style={{
            marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)',
            fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap',
          }}>
            {fmtDate(b.entryDate)} · {formatRelative(b.submittedAt)}
          </span>
        </div>

        {/* Task description */}
        {b.description && (
          <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 8, lineHeight: 1.5 }}>
            {b.description}
          </div>
        )}

        {/* Blocker reason */}
        <div style={{
          background: 'color-mix(in srgb, var(--risk) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--risk) 22%, transparent)',
          borderRadius: 6, padding: '8px 12px', marginBottom: b.supportNeeded ? 8 : 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--risk)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Blocker
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>
            {b.blockerReason ?? '—'}
          </div>
        </div>

        {/* Support needed */}
        {b.supportNeeded && (
          <div style={{
            background: 'color-mix(in srgb, var(--info) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--info) 22%, transparent)',
            borderRadius: 6, padding: '8px 12px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Support Needed
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>
              {b.supportNeeded}
            </div>
          </div>
        )}
      </div>

      {/* Hours badge */}
      {b.hours != null && (
        <div style={{
          alignSelf: 'flex-start', padding: '4px 8px', borderRadius: 4,
          background: 'var(--raised2)', border: '1px solid var(--line2)',
          fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)',
          whiteSpace: 'nowrap',
        }}>
          {b.hours}h
        </div>
      )}
    </div>
  );
}

// ── project group ──────────────────────────────────────────────────────────────

function ProjectGroup({ name, blockers }: { name: string; blockers: BlockedTaskDto[] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        padding: '8px 16px', background: 'var(--raised2)',
        borderRadius: '10px 10px 0 0', borderBottom: '1px solid var(--line)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', letterSpacing: '0.02em' }}>
          {name}
        </span>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--risk) 14%, transparent)',
          border: '1px solid color-mix(in srgb, var(--risk) 30%, transparent)',
          color: 'var(--risk)', fontWeight: 700,
        }}>
          {blockers.length} blocker{blockers.length !== 1 ? 's' : ''}
        </span>
      </div>
      <Card style={{ borderRadius: '0 0 10px 10px', padding: 0, overflow: 'hidden' }}>
        {blockers.map((b, i) => <BlockerCard key={b.taskId} b={b} isLast={i === blockers.length - 1} />)}
      </Card>
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function Blockers() {
  const { user } = useAuth();
  const { data: blockers, isPending, isError, refetch } = useBlockers(user?.id);

  if (isPending) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}><Skel h={24} w={160} /><div style={{ marginTop: 8 }}><Skel h={14} w={120} /></div></div>
        <Card>
          {[0, 1].map(i => (
            <div key={i} style={{ padding: '16px', borderBottom: '1px solid var(--line)' }}>
              <Skel h={13} w="40%" /><div style={{ marginTop: 8 }}><Skel h={60} /></div>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Blockers</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load blockers.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  const groups = groupByProject(blockers!);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Blockers
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            Active blockers across submitted EOD entries
          </p>
        </div>
        {blockers!.length > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 20,
            background: 'color-mix(in srgb, var(--risk) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--risk) 30%, transparent)',
            fontSize: 12, fontWeight: 700, color: 'var(--risk)',
          }}>
            <AlertTriangle size={12} aria-hidden="true" />
            {blockers!.length} active
          </div>
        )}
      </div>

      {blockers!.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'color-mix(in srgb, var(--ok) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertTriangle size={18} style={{ color: 'var(--ok)' }} aria-hidden="true" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>No active blockers</div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>Your team has no blocked tasks in submitted entries.</div>
        </Card>
      ) : (
        groups.map(([name, items]) => (
          <ProjectGroup key={name} name={name} blockers={items} />
        ))
      )}
    </div>
  );
}
