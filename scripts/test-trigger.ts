/**
 * LOCAL ONLY — verification helper, not a deployed task.
 *
 * Fires a single task run against the local dev worker (must be running via
 * `npm run dev` / `npx trigger.dev dev` in another terminal) and polls until
 * it finishes, printing the final status and output/error.
 *
 * Usage: npx tsx scripts/test-trigger.ts <task-id> [json-payload | @path/to/payload.json]
 * Example: npx tsx scripts/test-trigger.ts gather-build-progress '{}'
 * Example: npx tsx scripts/test-trigger.ts draft-report @scripts/sample-draft-input.json
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { tasks, runs } from "@trigger.dev/sdk";

const taskId = process.argv[2];
const payloadArg = process.argv[3] ?? "{}";

if (!taskId) {
  console.error("Usage: npx tsx scripts/test-trigger.ts <task-id> [json-payload | @path/to/payload.json]");
  process.exit(1);
}

const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "CRASHED",
  "INTERRUPTED",
  "SYSTEM_FAILURE",
]);

async function main() {
  const rawPayload = payloadArg.startsWith("@") ? readFileSync(payloadArg.slice(1), "utf-8") : payloadArg;
  const payload = JSON.parse(rawPayload);
  const handle = await tasks.trigger(taskId, payload);
  console.log(`Triggered run ${handle.id} for task "${taskId}". Polling...`);

  let result = await runs.retrieve(handle.id);
  while (!TERMINAL_STATUSES.has(result.status)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    result = await runs.retrieve(handle.id);
    process.stdout.write(".");
  }
  console.log(`\nFinal status: ${result.status}`);

  if (result.status === "COMPLETED") {
    console.log("Output:\n", JSON.stringify(result.output, null, 2));
  } else {
    console.log("Error / attempts:\n", JSON.stringify(result.attempts ?? result.error, null, 2));
    process.exitCode = 1;
  }
}

main();
