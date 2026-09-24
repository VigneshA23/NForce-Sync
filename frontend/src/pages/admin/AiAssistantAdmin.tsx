import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, Bot, DollarSign, RefreshCw, Zap } from 'lucide-react';
import {
  fetchBilling,
  fetchBillingSettings,
  fetchHealth,
  fetchRateLimitSettings,
  fetchUsageStats,
  reindex,
  updateBillingSettings,
  updateRateLimitSettings,
  type AiBillingSettings,
  type AiRateLimitSettings,
} from '../../api/aiAssistant';
import { Card, KpiCard } from '../../components/KpiCard';
import { GlobalLoader } from '../../components/GlobalLoader';
import { extractApiError } from '../../api/admin';
import { useToast } from '../../lib/toast';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--txt)',
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-mut)',
  marginBottom: 6,
  display: 'block',
};

export default function AiAssistantAdmin() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const healthQuery = useQuery({ queryKey: ['ai-assistant', 'health'], queryFn: fetchHealth, staleTime: 30_000 });
  const usageQuery = useQuery({ queryKey: ['ai-assistant', 'admin', 'usage-stats', days], queryFn: () => fetchUsageStats(days) });
  const billingQuery = useQuery({ queryKey: ['ai-assistant', 'admin', 'billing'], queryFn: fetchBilling });
  const billingSettingsQuery = useQuery({ queryKey: ['ai-assistant', 'admin', 'billing-settings'], queryFn: fetchBillingSettings });
  const rateLimitQuery = useQuery({ queryKey: ['ai-assistant', 'admin', 'rate-limit-settings'], queryFn: fetchRateLimitSettings });

  const reindexMutation = useMutation({
    mutationFn: reindex,
    onSuccess: (report) => {
      showToast('success', `Re-index complete: ${report.chunks} chunks (${report.embedded} embedded, ${report.reused} reused, ${report.removed} removed).`);
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'health'] });
    },
    onError: (err) => showToast('error', extractApiError(err, 'Re-index failed')),
  });

  if (healthQuery.isLoading) {
    return <GlobalLoader fullScreen={false} label="Loading AI assistant status…" />;
  }

  const health = healthQuery.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bot size={24} /> AI & Automation
        </h1>
        <p style={{ color: 'var(--txt-mut)', fontSize: 13, marginTop: 6 }}>
          Operational controls for the NForce Sync AI support assistant.
        </p>
      </div>

      {/* Status */}
      <Card>
        <h2 style={sectionTitleStyle}>Status</h2>
        {health ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
            <StatusRow label="Enabled" value={health.enabled ? 'Yes' : 'No'} ok={health.enabled} />
            <StatusRow label="Index ready" value={health.indexReady ? 'Yes' : 'No'} ok={health.indexReady} />
            <StatusRow label="Indexed chunks" value={String(health.indexedChunks)} />
            <StatusRow label="Last indexed" value={health.lastIndexedAt ? new Date(health.lastIndexedAt).toLocaleString() : 'Never'} />
            <StatusRow label="LLM provider" value={health.llmProvider} />
            <StatusRow label="Embedding" value={`${health.embeddingProvider} (${health.embeddingDimensions}d)`} />
            <button
              onClick={() => reindexMutation.mutate()}
              disabled={reindexMutation.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px',
                borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: reindexMutation.isPending ? 'not-allowed' : 'pointer',
                marginLeft: 'auto',
              }}
            >
              <RefreshCw size={14} className={reindexMutation.isPending ? 'nf-r-spin' : undefined} />
              {reindexMutation.isPending ? 'Re-indexing…' : 'Re-index knowledge'}
            </button>
          </div>
        ) : (
          <p style={{ color: 'var(--risk)', fontSize: 13 }}>Could not load status.</p>
        )}
      </Card>

      {/* Usage */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Usage</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)',
                  background: days === d ? 'var(--brand)' : 'transparent',
                  color: days === d ? '#fff' : 'var(--txt-mut)', fontSize: 12.5, cursor: 'pointer',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {usageQuery.data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
              <KpiCard icon={<Zap size={18} />} label="Total Requests" value={usageQuery.data.totalRequests} accent="var(--info)" />
              <KpiCard icon={<Activity size={18} />} label="Total Tokens" value={usageQuery.data.totalTokens.toLocaleString()} accent="var(--brand-bright)" />
              <KpiCard
                icon={<AlertTriangle size={18} />}
                label="Success Rate"
                value={successRateLabel(usageQuery.data.successCount, usageQuery.data.errorCount)}
                accent={errorRatePct(usageQuery.data.successCount, usageQuery.data.errorCount) > 10 ? 'var(--risk)' : 'var(--ok)'}
              />
              <KpiCard icon={<Activity size={18} />} label="Avg Latency" value={`${Math.round(usageQuery.data.avgLatencyMs)}ms`} accent="var(--warn)" />
            </div>

            <div style={{ height: 220, marginBottom: 20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageQuery.data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--txt-mut)' }} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--txt-mut)' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="requestCount" name="Requests" fill="var(--info)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <BreakdownList title="By response type" points={usageQuery.data.byResponseType} />
              <BreakdownList title="By error code" points={usageQuery.data.byErrorCode} />
            </div>
          </>
        )}
      </Card>

      {/* Billing */}
      {billingQuery.data && billingSettingsQuery.data && (
        <BillingCard billing={billingQuery.data} settings={billingSettingsQuery.data} />
      )}

      {/* Rate limits */}
      {rateLimitQuery.data && <RateLimitCard settings={rateLimitQuery.data} />}
    </div>
  );
}

const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 };

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: ok === undefined ? 'var(--txt)' : ok ? 'var(--ok)' : 'var(--risk)' }}>
        {value}
      </div>
    </div>
  );
}

function BreakdownList({ title, points }: { title: string; points: { key: string; count: number }[] }) {
  const total = points.reduce((sum, p) => sum + p.count, 0) || 1;
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt-mut)', marginBottom: 10 }}>{title}</div>
      {points.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data in this window.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {points.map((p) => (
            <div key={p.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: 'var(--txt)' }}>{p.key}</span>
                <span style={{ color: 'var(--txt-mut)' }}>{p.count}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--raised2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(p.count / total) * 100}%`, background: 'var(--info)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function successRateLabel(success: number, errors: number): string {
  const total = success + errors;
  if (total === 0) return 'N/A';
  return `${Math.round((success / total) * 100)}%`;
}

function errorRatePct(success: number, errors: number): number {
  const total = success + errors;
  return total === 0 ? 0 : (errors / total) * 100;
}

function BillingCard({ billing, settings }: { billing: import('../../api/aiAssistant').AiBilling; settings: AiBillingSettings }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(settings);

  const mutation = useMutation({
    mutationFn: updateBillingSettings,
    onSuccess: (saved) => {
      setForm(saved);
      showToast('success', 'Billing settings saved.');
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'admin', 'billing'] });
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'admin', 'billing-settings'] });
    },
    onError: (err) => showToast('error', extractApiError(err, 'Failed to save billing settings')),
  });

  const usedPct = Math.min(100, billing.usedPercent);

  return (
    <Card>
      <h2 style={sectionTitleStyle}>Billing</h2>
      <p style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: -10, marginBottom: 16 }}>
        Internal estimate from recorded token usage and the prices below — not your Mistral invoice.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <DollarSign size={20} color="var(--brand-bright)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--txt)' }}>
            ${billing.estimatedCostUsd.toFixed(2)} <span style={{ fontSize: 13, color: 'var(--txt-mut)', fontWeight: 400 }}>/ ${billing.monthlyBudgetUsd.toFixed(2)} this month</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--raised2)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${usedPct}%`, background: billing.usedPercent > 100 ? 'var(--risk)' : 'var(--brand)' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <NumberField label="Monthly budget (USD)" value={form.monthlyBudgetUsd} onChange={(v) => setForm({ ...form, monthlyBudgetUsd: v })} />
        <NumberField label="Prompt $/1M tokens" value={form.promptCostPerMillionUsd} onChange={(v) => setForm({ ...form, promptCostPerMillionUsd: v })} step={0.01} />
        <NumberField label="Completion $/1M tokens" value={form.completionCostPerMillionUsd} onChange={(v) => setForm({ ...form, completionCostPerMillionUsd: v })} step={0.01} />
        <NumberField label="Embedding $/1M tokens" value={form.embeddingCostPerMillionUsd} onChange={(v) => setForm({ ...form, embeddingCostPerMillionUsd: v })} step={0.01} />
      </div>
      <button
        onClick={() => mutation.mutate(form)}
        disabled={mutation.isPending}
        style={saveButtonStyle}
      >
        {mutation.isPending ? 'Saving…' : 'Save billing settings'}
      </button>
    </Card>
  );
}

function RateLimitCard({ settings }: { settings: AiRateLimitSettings }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(settings);

  const mutation = useMutation({
    mutationFn: updateRateLimitSettings,
    onSuccess: (saved) => {
      setForm(saved);
      showToast('success', 'Rate limit settings saved.');
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'admin', 'rate-limit-settings'] });
    },
    onError: (err) => showToast('error', extractApiError(err, 'Failed to save rate limit settings')),
  });

  return (
    <Card>
      <h2 style={sectionTitleStyle}>Rate limits</h2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        <span style={{ fontSize: 13, color: 'var(--txt)' }}>Enabled</span>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Requests per window (1–1000)</label>
          <input
            type="number" min={1} max={1000} value={form.requestsPerWindow} style={inputStyle}
            onChange={(e) => setForm({ ...form, requestsPerWindow: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={labelStyle}>Window (minutes, 1–1440)</label>
          <input
            type="number" min={1} max={1440} value={form.windowMinutes} style={inputStyle}
            onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })}
          />
        </div>
      </div>
      <button
        onClick={() => mutation.mutate(form)}
        disabled={mutation.isPending}
        style={saveButtonStyle}
      >
        {mutation.isPending ? 'Saving…' : 'Save rate limit settings'}
      </button>
    </Card>
  );
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" min={0} step={step} value={value} style={inputStyle} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

const saveButtonStyle: React.CSSProperties = {
  marginTop: 16,
  padding: '9px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--brand)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
