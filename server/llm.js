import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

import { runDeterministicAnalysis } from '../shared/analysis.js';

const ChangeSchema = z.object({
  id: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  riskLabel: z.string(),
  summary: z.string(),
  whyItMatters: z.string(),
  tags: z.array(z.string()).max(6),
});

const ComparisonSchema = z.object({
  headline: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  summaryBullets: z.array(z.string()).min(3).max(5),
  whyMatters: z.array(z.string()).min(2).max(5),
  changeOverrides: z.array(ChangeSchema),
});

function getLLMProviderConfig() {
  if (process.env.OPENROUTER_API_KEY) {
    const headers = {};

    if (process.env.OPENROUTER_SITE_URL) {
      headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
    }

    if (process.env.OPENROUTER_APP_NAME) {
      headers['X-Title'] = process.env.OPENROUTER_APP_NAME;
    }

    return {
      provider: 'OpenRouter',
      client: new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: headers,
      }),
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'OpenAI',
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    };
  }

  return null;
}

function buildRunLog(mode, metrics, modelMode) {
  return [
    {
      title: 'Sources ingested',
      detail: mode === 'url' ? 'Fetched and extracted both URLs on the server.' : 'Accepted both pasted policy texts for direct processing.',
    },
    {
      title: 'Clauses normalized',
      detail: 'Cleaned noisy markup, segmented the text, and mapped likely sections.',
    },
    {
      title: 'Baseline diff complete',
      detail: `Matched document sections and found ${metrics.total} changed clauses.`,
    },
    {
      title: 'Risk evaluation complete',
      detail: `Ranked ${metrics.highRisk} high-risk changes using ${modelMode}.`,
    },
    {
      title: 'Summary generated',
      detail: 'Prepared executive takeaways, why-it-matters notes, and review guidance.',
    },
  ];
}

function mergeChanges(baseChanges, overrides) {
  const overrideMap = new Map(overrides.map((item) => [item.id, item]));
  return baseChanges.map((change) => {
    const override = overrideMap.get(change.id);
    return override
      ? {
          ...change,
          riskLevel: override.riskLevel,
          riskLabel: override.riskLabel,
          summary: override.summary,
          whyItMatters: override.whyItMatters,
          tags: override.tags,
        }
      : change;
  });
}

async function runOpenAIEnhancement({ previousText, currentText, baseline, model }) {
  const config = getLLMProviderConfig();
  if (!config) return null;

  const response = await config.client.responses.parse({
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              'You are a policy-comparison analyst. Improve the baseline change review, keep the disclaimer stance informational only, and do not invent changes that are not grounded in the provided text.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify(
              {
                previousText: previousText.slice(0, 16000),
                currentText: currentText.slice(0, 16000),
                baseline,
              },
              null,
              2,
            ),
          },
        ],
      },
    ],
    text: {
      format: zodTextFormat(ComparisonSchema, 'termswatch_comparison'),
    },
  });

  return {
    parsed: response.output_parsed,
    provider: config.provider,
  };
}

export async function analyzeDocuments({ previousText, currentText, mode, model = 'openrouter/free' }) {
  const baseline = runDeterministicAnalysis(previousText, currentText);
  let enhanced = null;
  let modelMode = 'deterministic fallback';

  try {
    enhanced = await runOpenAIEnhancement({ previousText, currentText, baseline, model });
    if (enhanced) modelMode = `LLM enhanced via ${enhanced.provider} (${model})`;
  } catch {
    baseline.overview.summaryBullets = [
      'LLM enhancement was unavailable, so TermsWatch used the built-in comparison engine.',
      ...baseline.overview.summaryBullets,
    ].slice(0, 5);
    baseline.overview.whyMatters = [
      'Add a valid OPENAI_API_KEY or OPENROUTER_API_KEY to upgrade these outputs with model-based reasoning and richer clause descriptions.',
      ...baseline.overview.whyMatters,
    ].slice(0, 5);
  }

  const parsed = enhanced?.parsed ?? null;
  const changes = parsed ? mergeChanges(baseline.changes, parsed.changeOverrides) : baseline.changes;
  const overview = parsed
    ? {
        ...baseline.overview,
        headline: parsed.headline,
        confidence: parsed.confidence,
        summaryBullets: parsed.summaryBullets,
        whyMatters: parsed.whyMatters,
        modelMode,
      }
    : { ...baseline.overview, modelMode };

  return {
    overview,
    metrics: baseline.metrics,
    changes,
    runLog: buildRunLog(mode, baseline.metrics, modelMode),
  };
}
