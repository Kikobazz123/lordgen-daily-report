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
5. Suggestions — 2 to 4 short, concrete suggestions for what to do next, grounded only in the
   data given (e.g. if nothing changed, say so plainly rather than padding with generic advice).

htmlBody should be simple inline-styled HTML (headings, paragraphs, a small table for the
competitor sections is fine). textBody is the plain-text equivalent.

DATA:
${JSON.stringify(input, null, 2)}`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    subject: { type: "STRING" },
    htmlBody: { type: "STRING" },
    textBody: { type: "STRING" },
  },
  required: ["subject", "htmlBody", "textBody"],
};

export const draftReport = task({
  id: "draft-report",
  run: async (input: DraftReportInput): Promise<DraftReportOutput> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    // "gemini-flash-latest" is a Google-maintained alias, not a pinned version — it stays valid
    // as older dated models (like gemini-2.5-flash) get deprecated for new accounts.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini response had no text content");

    const parsed: DraftReportOutput = JSON.parse(text);
    if (!parsed.subject || !parsed.htmlBody || !parsed.textBody) {
      throw new Error("Gemini response missing required keys (subject/htmlBody/textBody)");
    }
    return parsed;
  },
});
