import { Fragment } from "react";
import type { JobsTimeline } from "@/types/simulation";
import { ganttColors } from "@/lib/theme";
import { Card } from "./ui";

export function GanttChart({ timeline }: { timeline: JobsTimeline | null }) {
  if (!timeline?.jobs?.length) {
    return <Card title="Job Timeline (final summary)">No jobs in timeline.</Card>;
  }

  const makespan = timeline.makespan || 1;
  const gpuIds = Array.from(new Set(timeline.jobs.flatMap((j) => j.assigned_gpus))).sort();
  const unassigned = timeline.jobs.filter((j) => j.assigned_gpus.length === 0);
  const rows = gpuIds.length ? gpuIds : unassigned.length ? ["unassigned"] : ["gpu-0"];

  function renderJobBar(job: JobsTimeline["jobs"][0], gpuId: string) {
    if (job.state === "failed") {
      const left = (job.arrival_time / makespan) * 100;
      const width = (((job.finish_time ?? job.arrival_time) - job.arrival_time) / makespan) * 100;
      return (
        <div
          key={`${job.job_id}-failed`}
          className="absolute top-1 h-4 rounded border border-dashed gantt-bar-grow"
          style={{
            left: `${left}%`,
            width: `${Math.max(width, 1)}%`,
            borderColor: ganttColors.failed,
            backgroundColor: `${ganttColors.failed}80`,
          }}
          title={`${job.name} (failed)`}
          aria-label={`${job.name} failed`}
        />
      );
    }

    if (job.start_time == null) {
      const left = (job.arrival_time / makespan) * 100;
      const end = job.finish_time ?? makespan;
      const width = ((end - job.arrival_time) / makespan) * 100;
      return (
        <div
          key={`${job.job_id}-unschedulable`}
          className="absolute top-1 h-4 rounded border border-dashed gantt-bar-grow"
          style={{
            left: `${left}%`,
            width: `${Math.max(width, 1)}%`,
            borderColor: ganttColors.wait,
            backgroundColor: `${ganttColors.wait}66`,
          }}
          title={`${job.name} (${job.state}, never started on ${gpuId})`}
          aria-label={`${job.name} ${job.state}`}
        />
      );
    }

    const waitLeft = (job.arrival_time / makespan) * 100;
    const waitWidth = ((job.start_time - job.arrival_time) / makespan) * 100;
    const runLeft = (job.start_time / makespan) * 100;
    const runEnd = job.finish_time ?? job.start_time + job.runtime;
    const runWidth = ((runEnd - job.start_time) / makespan) * 100;

    return (
      <Fragment key={job.job_id}>
        {waitWidth > 0 ? (
          <div
            className="absolute top-1 h-4 rounded gantt-bar-grow"
            style={{
              left: `${waitLeft}%`,
              width: `${waitWidth}%`,
              backgroundColor: `${ganttColors.wait}B3`,
            }}
            title={`wait: ${job.name}`}
            aria-label={`${job.name} waiting`}
          />
        ) : null}
        <div
          className="absolute top-1 h-4 rounded gantt-bar-grow"
          style={{
            left: `${runLeft}%`,
            width: `${Math.max(runWidth, 0.5)}%`,
            backgroundColor: `${ganttColors.run}CC`,
          }}
          title={`run: ${job.name}`}
          aria-label={`${job.name} running`}
        />
      </Fragment>
    );
  }

  return (
    <Card
      title="Job Timeline (final summary)"
      description="Full-run Gantt view. Does not update during scheduler replay."
    >
      <div className="space-y-2">
        {rows.map((gpuId) => {
          const jobsOnGpu =
            gpuId === "unassigned"
              ? unassigned
              : timeline.jobs.filter((j) => j.assigned_gpus.includes(gpuId));
          return (
            <div key={gpuId} className="flex items-center gap-2 text-xs">
              <div className="w-16 shrink-0 font-mono text-hs-muted">{gpuId}</div>
              <div
                className="relative h-6 flex-1 rounded"
                style={{ backgroundColor: ganttColors.track }}
              >
                {jobsOnGpu.map((job) => renderJobBar(job, gpuId))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-hs-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded" style={{ backgroundColor: `${ganttColors.wait}B3` }} /> wait
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded" style={{ backgroundColor: `${ganttColors.run}CC` }} /> run
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="h-2 w-4 rounded border border-dashed"
            style={{ borderColor: ganttColors.wait, backgroundColor: `${ganttColors.wait}66` }}
          />{" "}
          unschedulable
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="h-2 w-4 rounded border border-dashed"
            style={{ borderColor: ganttColors.failed, backgroundColor: `${ganttColors.failed}80` }}
          />{" "}
          failed
        </span>
      </div>
    </Card>
  );
}
