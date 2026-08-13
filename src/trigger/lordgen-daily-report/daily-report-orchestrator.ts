import { schedules, idempotencyKeys } from "@trigger.dev/sdk";
import { gatherBuildProgress } from "./gather-build-progress.js";
import { researchCompetitors } from "./research-competitors.js";
import { draftReport } from "./draft-report.js";
import { sendReportEmail } from "./send-report-email.js";
import { updateClickUpTask } from "./update-clickup-task.js";

const REQUIRED_ENV_VARS = [
  "PERPLEXITY_API_KEY",
  "GEMINI_API_KEY",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
  "REPORT_RECIPIENT_EMAIL",
  "CLICKUP_API_TOKEN",
] as const;

// 7am WAT (matches LordGen's Nigerian SME audience). Confirm/change if a different
// local time is preferred — see the plan's "Open judgment calls" section.
export const dailyReportOrchestrator = schedules.task({
  id: "lordgen-daily-report",
  cron: "0 6 * * *",
  run: async (payload) => {
    for (const key of REQUIRED_ENV_VARS) {
      if (!process.env[key]) {
        throw new Error(`${key} is not set — see .env and the credential-gate skill`);
      }
    }

    const buildProgressResult = await gatherBuildProgress.triggerAndWait({});
    if (!buildProgressResult.ok) {
      throw new Error(`gather-build-progress failed: ${JSON.stringify(buildProgressResult.error)}`);
    }

    const competitorResearchResult = await researchCompetitors.triggerAndWait({});
    if (!competitorResearchResult.ok) {
      throw new Error(`research-competitors failed: ${JSON.stringify(competitorResearchResult.error)}`);
    }

    const draftResult = await draftReport.triggerAndWait({
      buildProgress: buildProgressResult.output,
      competitorResearch: competitorResearchResult.output,
    });
    if (!draftResult.ok) {
      throw new Error(`draft-report failed: ${JSON.stringify(draftResult.error)}`);
    }

    // new Date(...) handles both a real Date (real cron fires) and an ISO string
    // (manual test triggers, where JSON has no Date type).
    const runDate = new Date(payload.timestamp).toISOString().slice(0, 10);
    // scope: "global" — a plain string idempotencyKey defaults to "run" scope (tied to this
    // orchestrator run's own ID), which would NOT dedupe across separate top-level runs, i.e.
    // exactly the case this guards against (a manual retrigger or duplicate cron fire same day).
    const emailIdempotencyKey = await idempotencyKeys.create(`lordgen-report-${runDate}`, {
      scope: "global",
    });
    const sendResult = await sendReportEmail.triggerAndWait(
      {
        subject: draftResult.output.subject,
        htmlBody: draftResult.output.htmlBody,
        textBody: draftResult.output.textBody,
      },
      { idempotencyKey: emailIdempotencyKey }
    );
    if (!sendResult.ok) {
      throw new Error(`send-report-email failed: ${JSON.stringify(sendResult.error)}`);
    }

    // No idempotency key needed here — this is a PUT (full overwrite), not a create,
    // so re-running it same day just re-writes equivalent content, no duplication risk.
    const clickupResult = await updateClickUpTask.triggerAndWait({
      subject: draftResult.output.subject,
      markdownBody: draftResult.output.markdownBody,
    });
    if (!clickupResult.ok) {
      throw new Error(`update-clickup-task failed: ${JSON.stringify(clickupResult.error)}`);
    }

    return {
      sent: sendResult.output.sent,
      clickupUpdated: clickupResult.output.updated,
      subject: draftResult.output.subject,
      changedEntryCount: buildProgressResult.output.changedEntries.length,
    };
  },
});
