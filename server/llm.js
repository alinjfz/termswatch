import { loadEnvFile } from './env.js';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

import { runDeterministicAnalysis } from '../shared/analysis.js';

loadEnvFile();

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

const ANALYST_INSTRUCTIONS =
  'You are a policy-comparison analyst. Improve the baseline change review, keep the disclaimer stance informational only, and do not invent changes that are not grounded in the provided text.';

function resolveModel(model) {
  if (!model || model === 'default') {
    if (process.env.OPENROUTER_API_KEY) {
      return 'openrouter/free';
    }
    if (process.env.OPENAI_API_KEY) {
      return 'gpt-4o-mini';
    }
    return 'openrouter/free';
  }

  return model;
}

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
      providerLabel: 'Model API',
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
      providerLabel: 'Model API',
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    };
  }

  return null;
}

export function getAIProviderStatus() {
  const config = getLLMProviderConfig();
  if (!config) {
    return {
      configured: false,
      provider: null,
      defaultModel: 'default',
      message: 'Deterministic comparison is active.',
    };
  }

  return {
    configured: true,
    provider: config.providerLabel,
    defaultModel: 'default',
    message: 'Live model reasoning is available.',
  };
}

function buildRunLog(mode, metrics, modelMode, enhancementNote) {
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
      detail: enhancementNote || 'Prepared executive takeaways, why-it-matters notes, and review guidance.',
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

function buildEnhancementPayload(previousText, currentText, baseline) {
  return JSON.stringify(
    {
      previousText: previousText.slice(0, 16000),
      currentText: currentText.slice(0, 16000),
      baseline,
    },
    null,
    2,
  );
}

async function runStructuredResponsesEnhancement({ config, previousText, currentText, baseline, model }) {
  const response = await config.client.responses.parse({
    model,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: ANALYST_INSTRUCTIONS }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: buildEnhancementPayload(previousText, currentText, baseline) }],
      },
    ],
    text: {
      format: zodTextFormat(ComparisonSchema, 'termswatch_comparison'),
    },
  });

  if (!response.output_parsed) {
    throw new Error('Structured model response did not include parsed output.');
  }

  return response.output_parsed;
}

async function runChatCompletionEnhancement({ config, previousText, currentText, baseline, model }) {
  const response = await config.client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${ANALYST_INSTRUCTIONS} Return only valid JSON with keys: headline, confidence, summaryBullets, whyMatters, changeOverrides.`,
      },
      {
        role: 'user',
        content: buildEnhancementPayload(previousText, currentText, baseline),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Chat completion returned an empty response.');
  }

  const parsed = ComparisonSchema.parse(JSON.parse(content));
  return parsed;
}

async function runLLMEnhancement({ previousText, currentText, baseline, model }) {
  const config = getLLMProviderConfig();
  if (!config) {
    return null;
  }

  let lastError = null;

  try {
    const parsed = await runStructuredResponsesEnhancement({
      config,
      previousText,
      currentText,
      baseline,
      model,
    });
    return { parsed, provider: config.providerLabel };
  } catch (error) {
    lastError = error;
  }

  try {
    const parsed = await runChatCompletionEnhancement({
      config,
      previousText,
      currentText,
      baseline,
      model,
    });
    return { parsed, provider: config.providerLabel };
  } catch (error) {
    lastError = error;
    throw lastError instanceof Error ? lastError : new Error('Model enhancement failed.');
  }
}

function applyFallbackMessaging(baseline, reason) {
  baseline.overview.summaryBullets = [
    'Model enhancement was unavailable, so TermsWatch used the built-in comparison engine.',
    ...baseline.overview.summaryBullets,
  ].slice(0, 5);
  baseline.overview.whyMatters = [
    reason,
    ...baseline.overview.whyMatters,
  ].slice(0, 5);
}

export async function analyzeDocuments({ previousText, currentText, mode, model = 'default' }) {
  const resolvedModel = resolveModel(model);
  const baseline = runDeterministicAnalysis(previousText, currentText);
  let enhanced = null;
  let modelMode = 'deterministic fallback';
  let enhancementNote = 'Prepared executive takeaways, why-it-matters notes, and review guidance.';
  const aiStatus = getAIProviderStatus();

  try {
    enhanced = await runLLMEnhancement({ previousText, currentText, baseline, model: resolvedModel });
    if (enhanced) {
      modelMode = 'LLM enhanced';
      enhancementNote = 'Model reasoning upgraded headlines, summaries, and clause explanations.';
    } else {
      applyFallbackMessaging(
        baseline,
        aiStatus.message,
      );
      enhancementNote = aiStatus.message;
    }
  } catch (error) {
    const reason =
      error instanceof Error
        ? `Model enhancement failed (${error.message}). TermsWatch kept the deterministic comparison output.`
        : 'Model enhancement failed. TermsWatch kept the deterministic comparison output.';
    applyFallbackMessaging(baseline, reason);
    enhancementNote = reason;
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
    runLog: buildRunLog(mode, baseline.metrics, modelMode, enhancementNote),
  };
}
