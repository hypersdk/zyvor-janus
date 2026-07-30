"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { MetricsDashboard } from "@/components/MetricsCharts";
import {
  AppLink,
  Button,
  Card,
  FormField,
  PageHero,
  SchedulerPillGroup,
  Select,
  Skeleton,
} from "@/components/ui";
import { fetchBenchmarkPresets, fetchBenchmarkReports, runBenchmark } from "@/lib/api";
import { chartColors, theme } from "@/lib/theme";
import { easeOut, fadeInUp, staggerContainer } from "@/lib/motion";
import type { SchedulerBenchmarkReport, SimulationMetrics } from "@/types/simulation";

type ReportRow = {
  run_id: string;
  config: string;
  scheduler: string | null;
  benchmark: SchedulerBenchmarkReport | null;
};

function scoreDims(b: SchedulerBenchmarkReport | null | undefined) {
  if (!b) return null;
  const sv = b.score_vector ?? {};
  return {
    makespan: Number(sv.makespan ?? b.metrics?.makespan ?? 0),
    gpu_util: Number(sv.gpu_utilization ?? b.metrics?.gpu_utilization ?? 0),
    ttft: Number(sv.ttft_p50 ?? b.metrics?.ttft_p50 ?? 0),
    fairness: Number(sv.jain_fairness ?? b.jain_fairness ?? 0),
    cost: Number(sv.cost_usd ?? b.cost_usd ?? 0),
  };
}

/** Normalize so higher is better for radar display. */
function radarPoints(b: SchedulerBenchmarkReport) {
  const d = scoreDims(b)!;
  const makespanScore = d.makespan > 0 ? 1 / (1 + d.makespan) : 0;
  const costScore = d.cost > 0 ? 1 / (1 + d.cost) : 1;
  const ttftScore = d.ttft > 0 ? 1 / (1 + d.ttft) : 1;
  return [
    { dim: "Makespan", value: makespanScore * 100 },
    { dim: "GPU util", value: Math.min(100, d.gpu_util <= 1 ? d.gpu_util * 100 : d.gpu_util) },
    { dim: "TTFT", value: ttftScore * 100 },
    { dim: "Fairness", value: Math.min(100, d.fairness <= 1 ? d.fairness * 100 : d.fairness) },
    { dim: "Cost", value: costScore * 100 },
  ];
}

function cellClass(value: number, best: number, worseIsHigher: boolean) {
  if (!Number.isFinite(value) || !Number.isFinite(best)) return "";
  const isBest = worseIsHigher ? value <= best : value >= best;
  const isWorst = worseIsHigher ? value > best * 1.25 : value < best * 0.75;
  if (isBest) return "compare-cell-best";
  if (isWorst) return "compare-cell-worst";
  return "";
}

export default function BenchmarkPage() {
  const [configs, setConfigs] = useState<Array<{ id: string; path: string }>>([]);
  const [presets, setPresets] = useState<Array<{ id: string; description: string }>>([]);
  const [selected, setSelected] = useState("inference_llama.yaml");
  const [scheduler, setScheduler] = useState("fifo");
  const [metrics, setMetrics] = useState<SimulationMetrics | null>(null);
  const [benchmark, setBenchmark] = useState<SchedulerBenchmarkReport | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchBenchmarkPresets()
        .then((data) => {
          setConfigs(data.configs);
          setPresets(data.workload_presets);
          if (data.configs.length && !selected) setSelected(data.configs[0].id);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load presets")),
      fetchBenchmarkReports().then(setReports).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [selected]);

  async function handleRun() {
    setBusy(true);
    setError(null);
    try {
      const result = await runBenchmark(selected, scheduler);
      setMetrics(result.metrics);
      setBenchmark(result.benchmark);
      setRunNonce((n) => n + 1);
      const latest = await fetchBenchmarkReports();
      setReports(latest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Benchmark run failed");
    } finally {
      setBusy(false);
    }
  }

  const radarData = useMemo(() => (benchmark ? radarPoints(benchmark) : null), [benchmark]);

  const compareStats = useMemo(() => {
    const rows = reports.filter((r) => r.benchmark).slice(0, 8);
    if (!rows.length) return null;
    const dims = rows.map((r) => scoreDims(r.benchmark)!);
    const bestMakespan = Math.min(...dims.map((d) => d.makespan));
    const bestGpu = Math.max(...dims.map((d) => d.gpu_util));
    const bestTtft = Math.min(...dims.map((d) => (d.ttft > 0 ? d.ttft : Infinity)));
    const bestFair = Math.max(...dims.map((d) => d.fairness));
    const bestCost = Math.min(...dims.map((d) => d.cost));
    return { rows, dims, bestMakespan, bestGpu, bestTtft, bestFair, bestCost };
  }, [reports]);

  return (
    <div className="space-y-6">
      <PageHero
        kicker="BENCHMARK"
        titleAccent="BENCHMARK"
        title=""
        subtitle="Scheduler benchmarks with inference TTFT/TPS metrics and score vectors."
        status="offline"
        actions={<AppLink href="/">Dashboard</AppLink>}
      />

      <h2>Actions</h2>
      <Card variant="action" title="▶ Run benchmark">
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid gap-3 md:grid-cols-3"
            >
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </motion.div>
          ) : (
            <motion.div
              key="loaded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Config">
                  <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                    {configs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Scheduler">
                  <SchedulerPillGroup value={scheduler} onChange={setScheduler} />
                </FormField>
              </div>
              <div className="mt-4">
                <Button onClick={handleRun} disabled={busy}>
                  {busy ? "Running…" : "Run benchmark"}
                </Button>
              </div>
              {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
              <div className="mt-4 text-sm text-hs-muted">
                Workload presets: {presets.map((p) => p.id).join(", ") || "—"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <MetricsDashboard key={runNonce} metrics={metrics} />

      <AnimatePresence>
        {benchmark && radarData ? (
          <motion.div
            key="score-vector"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: easeOut }}
          >
            <Card title="Score vector" description="Higher is better on the radar (latency/cost inverted).">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="radar-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart key={runNonce} data={radarData}>
                      <PolarGrid stroke={chartColors.grid} />
                      <PolarAngleAxis dataKey="dim" tick={{ fill: chartColors.tick, fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Score"
                        dataKey="value"
                        stroke={theme.accent}
                        fill={theme.accent}
                        fillOpacity={0.35}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0b0f14",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: "8px",
                        }}
                        formatter={(v: number) => [`${v.toFixed(1)}`, "Score"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-sm text-hs-muted">
                  <p>
                    Cost estimate: <strong className="text-hs-heading">${benchmark.cost_usd.toFixed(2)}</strong>
                  </p>
                  <p>
                    Jain fairness:{" "}
                    <strong className="text-hs-heading">{benchmark.jain_fairness.toFixed(3)}</strong>
                  </p>
                  <p>
                    Fragmentation:{" "}
                    <strong className="text-hs-heading">{benchmark.fragmentation.toFixed(3)}</strong>
                  </p>
                  <div className="mt-3 rounded-hs border border-hs-border bg-hs-bg/40 p-3 font-mono text-xs">
                    {Object.entries(benchmark.score_vector).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-0.5">
                        <span>{k}</span>
                        <span className="text-hs-heading">
                          {typeof v === "number" ? v.toFixed(4) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Card title="Recent benchmark reports" description="Cells colored relative to the best value in each column.">
        {!compareStats ? (
          <p className="text-sm text-hs-muted">No benchmark reports yet.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Config</th>
                  <th>Scheduler</th>
                  <th>Makespan ↓</th>
                  <th>GPU util ↑</th>
                  <th>TTFT ↓</th>
                  <th>Fairness ↑</th>
                  <th>Cost ↓</th>
                  <th />
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                {compareStats.rows.map((r, i) => {
                  const d = compareStats.dims[i];
                  return (
                    <motion.tr key={r.run_id} layout variants={fadeInUp}>
                      <td className="font-medium text-hs-heading">{r.config}</td>
                      <td>{r.scheduler ?? "default"}</td>
                      <td className={cellClass(d.makespan, compareStats.bestMakespan, true)}>
                        {d.makespan.toFixed(2)}
                      </td>
                      <td className={cellClass(d.gpu_util, compareStats.bestGpu, false)}>
                        {(d.gpu_util <= 1 ? d.gpu_util * 100 : d.gpu_util).toFixed(1)}%
                      </td>
                      <td className={cellClass(d.ttft || Infinity, compareStats.bestTtft, true)}>
                        {d.ttft > 0 ? d.ttft.toFixed(3) : "—"}
                      </td>
                      <td className={cellClass(d.fairness, compareStats.bestFair, false)}>
                        {d.fairness.toFixed(3)}
                      </td>
                      <td className={cellClass(d.cost, compareStats.bestCost, true)}>
                        ${d.cost.toFixed(2)}
                      </td>
                      <td className="text-right">
                        <AppLink href={`/runs/${r.run_id}`}>Open</AppLink>
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
