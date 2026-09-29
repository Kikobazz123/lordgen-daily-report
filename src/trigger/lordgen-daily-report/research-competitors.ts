import { task } from "@trigger.dev/sdk";

export interface PerplexityResult {
  content: string;
  citations: string[];
}

/**
 * One research section. `available: false` means no research was done today and
 * `unavailableReason` says why; the report states that instead of inventing a
 * section, and the rest of the report still goes out.
 */
export interface ResearchSection extends PerplexityResult {
  available: boolean;
  unavailableReason?: string;
}

export interface CompetitorResearchOutput {
  nigerianSme: ResearchSection;
  generalAiConsulting: ResearchSection;
}

export function unavailable(reason: string): ResearchSection {
  return { available: false, unavailableReason: reason, content: "", citations: [] };
}

/**
 * Errors that retrying cannot fix: no credits, bad key. Retrying these only
 * delays the report, so they end research for the day immediately.
 * Sept 2026: an exhausted Perplexity balance returned 401 insufficient_quota on
 * every call, and because this task threw, no report was sent for a week.
 */
class PermanentResearchError extends Error {}

function isPermanent(status: number, body: string): boolean {
  return status === 401 || status === 402 || status === 403 || /insufficient_quota/i.test(body);
}

const NIGERIAN_SME_PROMPT = `Identify comparable Nigerian SME/trade-automation service providers — companies
offering AI or digitization tools/services to Nigerian tailors, welders, POS operators,
pharmacies, cold room operators, small schools, transport unions, and similar small
businesses (chatbots, reminders/follow-ups, record-keeping, invoicing, lead capture,
simple websites). For each provider found, note approximate pricing, service breadth,
and market maturity. Cite sources.`;

const GENERAL_AI_CONSULTING_PROMPT = `Identify comparable general AI consulting/automation agencies serving small and
medium businesses (not Nigeria-specific) — companies offering AI operations audits,
workflow automation, AI knowledge assistants, or AI agent systems as a service. For
each, note approximate pricing model, service breadth, and market maturity/company
size. Cite sources.`;

async function callPerplexity(apiKey: string, prompt: string): Promise<PerplexityResult> {
  const response = await fetch("https://api.perplexity.ai/v1/sonar", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: "You are a market research assistant. Be specific, cite sources, and do not invent companies or numbers you can't find.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const message = `Perplexity API error: ${response.status} ${body.slice(0, 300)}`;
    throw isPermanent(response.status, body) ? new PermanentResearchError(message) : new Error(message);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    citations: data.citations ?? [],
  };
}

export const researchCompetitors = task({
  id: "research-competitors",
  run: async (): Promise<CompetitorResearchOutput> => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      const reason = "PERPLEXITY_API_KEY is not set";
      return { nigerianSme: unavailable(reason), generalAiConsulting: unavailable(reason) };
    }

    // Sequential, not Promise.all — parallel calls tripped the account's per-second rate limit.
    // A permanent error (no credits, bad key) ends research for the day without retrying;
    // anything else still throws, so a transient failure gets the task's normal retries.
    const sections: ResearchSection[] = [];
    for (const prompt of [NIGERIAN_SME_PROMPT, GENERAL_AI_CONSULTING_PROMPT]) {
      try {
        sections.push({ ...(await callPerplexity(apiKey, prompt)), available: true });
      } catch (e) {
        if (!(e instanceof PermanentResearchError)) throw e;
        const reason = e.message.includes("insufficient_quota")
          ? "Perplexity credits are exhausted (add credits at console.perplexity.ai)"
          : e.message;
        while (sections.length < 2) sections.push(unavailable(reason));
        break;
      }
    }

    return { nigerianSme: sections[0], generalAiConsulting: sections[1] };
  },
});
