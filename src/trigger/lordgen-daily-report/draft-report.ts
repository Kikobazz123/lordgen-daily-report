import { task } from "@trigger.dev/sdk";
import type { BuildProgressOutput } from "./gather-build-progress.js";
import type { CompetitorResearchOutput } from "./research-competitors.js";

export interface DraftReportInput {
  buildProgress: BuildProgressOutput;
  competitorResearch: CompetitorResearchOutput;
}

export interface DraftReportOutput {
  subject: string;
  htmlBody: string;
  textBody: string;
  markdownBody: string;
}

const VOICE_RULES = `Voice rules, non-negotiable:
- No em dashes anywhere.
- No marketing buzzwords (leverage, streamline, unlock, empower, seamless, revolutionize,
  "cutting-edge", "game-changer", etc.).
- No invented numbers, prices, or case studies. If data is missing, say "not available yet" —
  never fabricate a plausible-sounding figure.
- LordGen has no live agents or operating metrics yet. Any comparison to competitors must be
  clearly labeled aspirational / pre-launch positioning, never presented as measured performance.
- Professional but practical: something the reader can skim in a couple of minutes, not a
  wall of text. Short paragraphs, plain sentences.`;

function buildPrompt(input: DraftReportInput): string {
  return `Draft this morning's LordGen status email from the structured data below.

${VOICE_RULES}

Structure the email in this order:
1. Build & Documentation Progress — summarize what changed since the last snapshot
   (changedEntries below), and note how many tracked folders were unchanged or missing.
2. LordGen Agent Directory Status — summarize agentDirectory below in plain language: how many
   loops are active, how many agents are proposed (not built), how many are parked, and that
   zero agents are live.
3. Competitor Positioning — Nigerian SME / Trade Automation — summarize nigerianSme.content
   below, noting it's fresh research, not a tracked metric.
4. Competitor Positioning — General AI Consulting — summarize generalAiConsulting.content below.
   For sections 3 and 4: if the section's "available" is false, write one sentence saying the
   research was not available today and why (its unavailableReason). Do not fill the section
   from your own knowledge.
5. Suggestions — 2 to 4 short, concrete suggestions for what to do next, grounded only in the
   data given (e.g. if nothing changed, say so plainly rather than padding with generic advice).

htmlBody should be simple inline-styled HTML (headings, paragraphs, a small table for the
competitor sections is fine). textBody is the plain-text equivalent. markdownBody is the same
content again in clean Markdown (### headings, bullet lists, pipe tables) — this version is
posted to a ClickUp task, so it must render correctly there: standard Markdown table syntax,
no HTML tags.

DATA:
${JSON.stringify(input, null, 2)}`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    subject: { type: "STRING" },
    htmlBody: { type: "STRING" },
    textBody: { type: "STRING" },
    markdownBody: { type: "STRING" },
  },
  required: ["subject", "htmlBody", "textBody", "markdownBody"],
};

/**
 * Tried in order; any failure moves to the next. "latest" aliases are Google-maintained and
 * survive dated-model retirements (gemini-2.5-flash now 404s for new accounts). The lite
 * models are the fallback because the full Flash alias returns 503 "high demand" at times.
 */
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"];

async function draftWith(model: string, apiKey: string, prompt: string): Promise<DraftReportOutput> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      // Key in a header rather than the query string, so it never lands in a URL log.
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini ${model} error: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini ${model} response had no text content`);

  const parsed: DraftReportOutput = JSON.parse(text);
  if (!parsed.subject || !parsed.htmlBody || !parsed.textBody || !parsed.markdownBody) {
    throw new Error(`Gemini ${model} response missing required keys (subject/htmlBody/textBody/markdownBody)`);
  }
  return parsed;
}

export const draftReport = task({
  id: "draft-report",
  run: async (input: DraftReportInput): Promise<DraftReportOutput> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const prompt = buildPrompt(input);
    const errors: string[] = [];
    for (const model of MODELS) {
      try {
        return await draftWith(model, apiKey, prompt);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    throw new Error(`Every Gemini model failed: ${errors.join(" | ")}`);
  },
});
