import { task } from "@trigger.dev/sdk";
// Imported (not read via fs at runtime) so the bundler inlines these JSON files at
// build time — Trigger.dev's build output doesn't carry along plain data files that
// are only referenced through fs.readFileSync.
import progressSnapshotJson from "./state/progress-snapshot.json" with { type: "json" };
import agentDirectoryStatusJson from "./state/agent-directory-status.json" with { type: "json" };

const LOOKBACK_MS = 25 * 60 * 60 * 1000; // 25h, wider than the daily cron interval

interface FolderSnapshot {
  label: string;
  path: string;
  exists: boolean;
  fileCount: number;
  latestMtimeMs: number;
}

interface ProgressSnapshot {
  generatedAt: string;
  folders: FolderSnapshot[];
}

interface AgentDirectoryStatus {
  last_updated: string;
  loops_active: number;
  loops_active_names: string[];
  agents_proposed: number;
  orchestration_roles_proposed: number;
  agents_parked: number;
  parked_breakdown: Record<string, number>;
  live_agents_running: number;
  sources: Record<string, string>;
  note: string;
}

export interface BuildProgressOutput {
  snapshotGeneratedAt: string;
  changedEntries: { label: string; fileCount: number; latestMtimeMs: number }[];
  unchangedCount: number;
  missingCount: number;
  agentDirectory: AgentDirectoryStatus;
}

/**
 * Phase 1 → Phase 2 swap seam.
 *
 * Today (Phase 1, no live LordGen agents), this reads a static snapshot
 * bundled at deploy time — see scripts/refresh-progress-snapshot.ts and the
 * plan's "Critical architectural constraint" section for why the cloud task
 * can't read the local filesystem live.
 *
 * Phase 2 (once real LordGen agents exist and are instrumented): replace the
 * body of this function with calls to the real telemetry store (per
 * Deep Research report.md §9 — invocation count, latency, token usage,
 * success/failure rate, MCP call rates/errors, business metrics), while
 * keeping the BuildProgressOutput shape the same so draft-report.ts never
 * needs to change.
 */
export const gatherBuildProgress = task({
  id: "gather-build-progress",
  run: async (): Promise<BuildProgressOutput> => {
    const snapshot = progressSnapshotJson as ProgressSnapshot;
    const agentDirectory = agentDirectoryStatusJson as AgentDirectoryStatus;

    const now = Date.now();
    const changedEntries: BuildProgressOutput["changedEntries"] = [];
    let unchangedCount = 0;
    let missingCount = 0;

    for (const folder of snapshot.folders) {
      if (!folder.exists) {
        missingCount += 1;
        continue;
      }
      if (now - folder.latestMtimeMs <= LOOKBACK_MS) {
        changedEntries.push({
          label: folder.label,
          fileCount: folder.fileCount,
          latestMtimeMs: folder.latestMtimeMs,
        });
      } else {
        unchangedCount += 1;
      }
    }

    return {
      snapshotGeneratedAt: snapshot.generatedAt,
      changedEntries,
      unchangedCount,
      missingCount,
      agentDirectory,
    };
  },
});
