import { task } from "@trigger.dev/sdk";

export interface PerplexityResult {
  content: string;
  citations: string[];
}

export interface CompetitorResearchOutput {
  nigerianSme: PerplexityResult;
  generalAiConsulting: PerplexityResult;
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
    throw new Error(`Perplexity API error: ${response.status} ${await response.text()}`);
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
    if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set");

    // Sequential, not Promise.all — parallel calls tripped the account's per-second rate limit.
    const nigerianSme = await callPerplexity(apiKey, NIGERIAN_SME_PROMPT);
    const generalAiConsulting = await callPerplexity(apiKey, GENERAL_AI_CONSULTING_PROMPT);

    return { nigerianSme, generalAiConsulting };
  },
});
