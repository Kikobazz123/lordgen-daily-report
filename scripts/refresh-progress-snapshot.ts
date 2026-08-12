/**
 * LOCAL ONLY — not a deployed Trigger.dev task.
 *
 * Run manually before each redeploy: `npx tsx scripts/refresh-progress-snapshot.ts`
 *
 * Walks the known LordGen folders on this machine and writes a small JSON
 * snapshot that gets bundled into the deployment. The deployed cloud task
 * (`gather-build-progress.ts`) has no access to this machine's filesystem —
 * it can only read whatever is bundled at deploy time — so this script is
 * the bridge between "what actually changed on disk" and "what the daily
 * report can see." See the plan's "Critical architectural constraint"
 * section for why.
 */
import { existsSync, readdirSync, statSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface TrackedFolder {
  label: string;
  path: string;
}

const TRACKED_FOLDERS: TrackedFolder[] = [
  { label: "Lordgen AI Skill builder", path: "C:\\Users\\USER\\Lordgen AI Skill builder" },
  { label: "Lordgen ai scraper", path: "C:\\Users\\USER\\Lordgen ai scraper" },
  { label: "Lordgen Markdown files", path: "C:\\Users\\USER\\Downloads\\Lordgen Markdown files" },
  { label: "Lordgen AI Post Reference", path: "C:\\Users\\USER\\Downloads\\Lordgen AI Post Reference" },
  { label: "Lordgen main files", path: "C:\\Users\\USER\\Downloads\\Lordgen main files" },
  { label: "lordgen-pitch skill", path: "C:\\Users\\USER\\.claude\\skills\\lordgen-pitch" },
  { label: "tool-scout skill", path: "C:\\Users\\USER\\.claude\\skills\\tool-scout" },
  { label: "lordgen-agent-directory skill", path: "C:\\Users\\USER\\.claude\\skills\\lordgen-agent-directory" },
  { label: "credential-gate skill", path: "C:\\Users\\USER\\.claude\\skills\\credential-gate" },
];

interface FolderSnapshot {
  label: string;
  path: string;
  exists: boolean;
  fileCount: number;
  latestMtimeMs: number;
}

function walk(dir: string): { fileCount: number; latestMtimeMs: number } {
  let fileCount = 0;
  let latestMtimeMs = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walk(fullPath);
      fileCount += sub.fileCount;
      latestMtimeMs = Math.max(latestMtimeMs, sub.latestMtimeMs);
    } else if (entry.isFile()) {
      fileCount += 1;
      const mtimeMs = statSync(fullPath).mtimeMs;
      latestMtimeMs = Math.max(latestMtimeMs, mtimeMs);
    }
  }

  return { fileCount, latestMtimeMs };
}

function snapshotFolder(folder: TrackedFolder): FolderSnapshot {
  if (!existsSync(folder.path)) {
    return { ...folder, exists: false, fileCount: 0, latestMtimeMs: 0 };
  }
  const { fileCount, latestMtimeMs } = walk(folder.path);
  return { ...folder, exists: true, fileCount, latestMtimeMs };
}

function main() {
  const stateDir = join(import.meta.dirname, "..", "src", "trigger", "lordgen-daily-report", "state");
  mkdirSync(stateDir, { recursive: true });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    folders: TRACKED_FOLDERS.map(snapshotFolder),
  };
  writeFileSync(join(stateDir, "progress-snapshot.json"), JSON.stringify(snapshot, null, 2));

  const statusSource = "C:\\Users\\USER\\.claude\\skills\\lordgen-agent-directory\\status.json";
  if (existsSync(statusSource)) {
    copyFileSync(statusSource, join(stateDir, "agent-directory-status.json"));
  } else {
    console.warn(`WARNING: ${statusSource} not found — agent-directory-status.json not refreshed.`);
  }

  console.log(`Snapshot written to ${stateDir}`);
  console.log("Redeploy trigger-demo for the daily report to pick this up.");
}

main();
