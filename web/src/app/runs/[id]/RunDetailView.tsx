"use client";

import { useEffect, useState } from "react";
import { ClusterView } from "@/components/ClusterView";
import { GanttChart } from "@/components/GanttChart";
import { MetricsDashboard } from "@/components/MetricsCharts";
import { MigView } from "@/components/MigView";
import { QueueTable } from "@/components/QueueTable";
import { ReplayControls } from "@/components/ReplayControls";
import { TopologyView } from "@/components/TopologyView";
import { AppLink, PageHero, StatusBadge } from "@/components/ui";
import { fetchEvents, fetchRun, fetchSnapshots, fetchTimeline, pollRun, runWebSocketUrl } from "@/lib/api";
import { useReplayStore } from "@/store/useReplayStore";
import type { ClusterSnapshot, JobsTimeline, RunDetail, SchedulerDecision } from "@/types/simulation";

type Phase = "loading" | "live" | "completed" | "failed";

export function RunDetailView({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [snapshots, setSnapshots] = useState<ClusterSnapshot[]>([]);
  const [decisions, setDecisions] = useState<SchedulerDecision[]>([]);
  const [timeline, setTimeline] = useState<JobsTimeline | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const index = useReplayStore((s) => s.index);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let stopPoll: (() => void) | null = null;
    let finalized = false;

    useReplayStore.getState().reset();

    async function loadCompletedExtras() {
      const [snaps, events, tl] = await Promise.all([
        fetchSnapshots(runId).catch(() => []),
        fetchEvents(runId).catch(() => []),
        fetchTimeline(runId).catch(() => null),
      ]);
      if (cancelled) return;
      setSnapshots(snaps);
      setDecisions(events);
      setTimeline(tl);
    }

    async function settle(detail: RunDetail) {
      if (finalized || cancelled) return;
      finalized = true;
      stopPoll?.();
      ws?.close();
      setRun(detail);
      if (detail.status === "completed") await loadCompletedExtras();
      if (!cancelled) setPhase(detail.status === "failed" ? "failed" : "completed");
    }

    function fallbackToPolling() {
      if (finalized || stopPoll) return;
      stopPoll = pollRun(runId, (updated) => {
        if (cancelled) return;
        setRun(updated);
        if (updated.status === "completed" || updated.status === "failed") {
          settle(updated);
        }
      });
    }

    async function init() {
      let initial: RunDetail;
      try {
        initial = await fetchRun(runId);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Run not found");
        return;
      }
      if (cancelled) return;
      setRun(initial);

      if (initial.status === "completed" || initial.status === "failed") {
        await settle(initial);
        return;
      }

      setPhase("live");
      try {
        ws = new WebSocket(runWebSocketUrl(runId));
      } catch {
        fallbackToPolling();
        return;
      }

      ws.onmessage = (event) => {
        if (cancelled) return;
        let msg: { type: string; data?: ClusterSnapshot };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === "snapshot" && msg.data) {
          setSnapshots((prev) => [...prev, msg.data as ClusterSnapshot]);
        } else if (msg.type === "complete") {
          fetchRun(runId)
            .then((detail) => settle(detail))
            .catch(() => fallbackToPolling());
        }
      };
      ws.onerror = () => {
        if (!cancelled) fallbackToPolling();
      };
      ws.onclose = () => {
        if (!cancelled && !finalized) fallbackToPolling();
      };
    }

    init();

    return () => {
      cancelled = true;
      ws?.close();
      stopPoll?.();
    };
  }, [runId]);

  if (loadError) {
    return <PageHero kicker="Run" title="Run not found" subtitle={loadError} />;
  }

  if (!run) {
    return <PageHero kicker="Run" title="Loading run…" />;
  }

  const live = phase === "live";
  const currentSnapshot = snapshots[index] ?? snapshots[snapshots.length - 1] ?? null;

  return (
    <>
      <div className="run-detail-header">
        <PageHero
          kicker={run.config}
          title={`Run ${run.id.slice(0, 8)}`}
          subtitle={run.scheduler ? `Scheduler: ${run.scheduler}` : undefined}
          actions={<AppLink href="/">Back to dashboard</AppLink>}
        />
        <div className="run-detail-meta">
          <StatusBadge status={run.status} />
          {live ? <span className="run-detail-live">Live</span> : null}
        </div>
      </div>

      {phase === "failed" && run.error ? <p className="run-error-banner">{run.error}</p> : null}
      {live ? (
        <p className="run-warning-banner">
          Simulation is running — results will appear here as they arrive, then finalize once the run
          completes.
        </p>
      ) : null}

      <div className="run-detail-grid">
        <ReplayControls snapshots={snapshots} decisions={decisions} live={live} />
        <ClusterView snapshot={currentSnapshot} />
        <TopologyView snapshot={currentSnapshot} />
        <MigView snapshot={currentSnapshot} />
        {!live ? (
          <div className="run-detail-span-2">
            <MetricsDashboard metrics={run.metrics} />
          </div>
        ) : null}
        {!live ? <GanttChart timeline={timeline} /> : null}
        {!live ? <QueueTable timeline={timeline} /> : null}
      </div>
    </>
  );
}
