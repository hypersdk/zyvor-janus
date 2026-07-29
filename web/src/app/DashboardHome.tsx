"use client";

import { useCallback, useEffect, useState } from "react";
import { ComparePanel } from "@/components/ComparePanel";
import { AppLink, Button, Card, EmptyState, FormField, MetricTile, PageHero, Select, StatusBadge } from "@/components/ui";
import { compareConfigs, fetchConfigs, fetchRuns, startRun } from "@/lib/api";
import type { CompareResult, ConfigEntry, RunSummary } from "@/types/simulation";

export function DashboardHome() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareResults, setCompareResults] = useState<CompareResult[]>([]);
  const [runBusy, setRunBusy] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const canCompare = Boolean(compareA && compareB && compareA !== compareB);

  const runningCount = runs.filter((r) => r.status === "running" || r.status === "pending").length;
  const completedCount = runs.filter((r) => r.status === "completed").length;
  const failedCount = runs.filter((r) => r.status === "failed").length;
  const health = failedCount > 0 ? "warn" : runningCount > 0 ? "live" : "idle";
  const healthLabel =
    health === "live" ? "Simulations running" : health === "warn" ? "Recent failures" : "Idle — ready to run";

  const refresh = useCallback(async () => {
    const [cfgs, runList] = await Promise.all([fetchConfigs(), fetchRuns()]);
    setConfigs(cfgs);
    setRuns(runList);
    if (!selected && cfgs.length) setSelected(cfgs[0].id);
  }, [selected]);

  useEffect(() => {
    refresh().catch(console.error);
    const t = setInterval(() => refresh().catch(console.error), 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function handleRun() {
    if (!selected || runBusy || compareBusy) return;
    setRunBusy(true);
    setRunError(null);
    try {
      const { id } = await startRun(selected);
      await refresh();
      window.location.href = `/runs/${id}`;
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Failed to start simulation");
    } finally {
      setRunBusy(false);
    }
  }

  async function handleCompare() {
    if (!canCompare || runBusy || compareBusy) return;
    setCompareBusy(true);
    setCompareError(null);
    try {
      const { results } = await compareConfigs([compareA, compareB]);
      setCompareResults(results);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setCompareBusy(false);
    }
  }

  return (
    <>
      <PageHero
        kicker="GPU Scheduler Simulator"
        title="Dashboard"
        subtitle="Launch simulations, inspect cluster state, replay scheduler decisions, and compare scheduling policies side by side."
        actions={
          <>
            <AppLink href="/benchmark">Benchmark</AppLink>
            <AppLink href="/what-if">What-if</AppLink>
          </>
        }
      />

      <div className="ops-status-pill">
        <span className={`status-lamp status-lamp-${health}`} />
        {healthLabel}
      </div>
      <div className="metrics-grid ops-kpi-grid">
        <MetricTile label="Total Runs" value={String(runs.length)} />
        <MetricTile label="Running Now" value={String(runningCount)} />
        <MetricTile label="Completed" value={String(completedCount)} />
        <MetricTile label="Failed" value={String(failedCount)} />
      </div>

      <div className="dashboard-grid">
        <Card
          variant="action"
          title="Cluster Summary"
          description="Pick a cluster config and start a new simulation run."
        >
          <div className="form-row">
            <FormField label="Configuration">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={runBusy || compareBusy}>
                {configs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button disabled={runBusy || compareBusy || !selected} onClick={handleRun}>
              {runBusy ? "Starting…" : "Run simulation"}
            </Button>
          </div>
          {runError ? <p className="inline-error-banner">{runError}</p> : null}
        </Card>

        <Card title="Recent Runs" description="Latest simulation jobs from this session.">
          {runs.length === 0 ? (
            <EmptyState
              title="No runs yet"
              text="Start a simulation above to populate this table with live status and metrics."
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Config</th>
                    <th>Run</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="font-medium text-hs-heading">{run.config}</td>
                      <td className="font-mono text-xs text-hs-muted">{run.id.slice(0, 8)}</td>
                      <td>
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="font-mono text-xs text-hs-muted">{run.created_at.slice(0, 19)}</td>
                      <td className="text-right">
                        <AppLink href={`/runs/${run.id}`}>Open</AppLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Compare Two Configs" description="Run both configs and compare scheduling metrics side by side.">
          <div className="form-row">
            <FormField label="Config A">
              <Select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                disabled={compareBusy}
              >
                <option value="">Select config…</option>
                {configs.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === compareB}>
                    {c.id}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Config B">
              <Select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                disabled={compareBusy}
              >
                <option value="">Select config…</option>
                {configs.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === compareA}>
                    {c.id}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button variant="secondary" disabled={compareBusy || runBusy || !canCompare} onClick={handleCompare}>
              {compareBusy ? "Comparing…" : "Compare"}
            </Button>
          </div>
          {configs.length < 2 ? (
            <p className="compare-hint">Add at least two cluster configs to compare scheduling policies.</p>
          ) : null}
          {compareBusy ? (
            <p className="compare-progress">Running both simulations — this may take a minute for large configs.</p>
          ) : null}
          {compareError ? <p className="inline-error-banner">{compareError}</p> : null}
          <ComparePanel results={compareResults} />
        </Card>
      </div>
    </>
  );
}
