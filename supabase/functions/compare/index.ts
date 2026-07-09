import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Analysis logic (ported from shared/analysis.js) ────────────────────────

const RISK_RULES = [
  { label: "Data sharing expansion", level: "high", score: 3, keywords: ["sell", "share", "third party", "partners", "advertising", "affiliate"], why: "Broader sharing language can materially change how personal data moves outside the service.", tags: ["privacy", "sharing"] },
  { label: "Arbitration or class action", level: "high", score: 3, keywords: ["arbitration", "class action", "jury trial", "waive"], why: "Dispute-resolution changes can limit how users or customers challenge the company.", tags: ["legal", "disputes"] },
  { label: "Auto-renewal and billing", level: "high", score: 3, keywords: ["auto-renew", "automatic renewal", "subscription", "billing", "fees", "non-refundable"], why: "Payment and renewal changes can create direct financial impact for the customer.", tags: ["billing", "subscription"] },
  { label: "Liability and indemnity", level: "medium", score: 2, keywords: ["liability", "indemnify", "damages", "warranty"], why: "Liability shifts often affect who absorbs legal or commercial risk.", tags: ["legal", "liability"] },
  { label: "Notice and consent", level: "medium", score: 2, keywords: ["notice", "consent", "email", "notify"], why: "Notice language determines how much warning people receive before new terms take effect.", tags: ["communications"] },
  { label: "Data retention and deletion", level: "medium", score: 2, keywords: ["retain", "retention", "delete", "deletion", "archive"], why: "Retention changes alter how long sensitive information stays available.", tags: ["privacy", "retention"] },
  { label: "Security commitments", level: "low", score: 1, keywords: ["security", "encrypt", "breach", "protect"], why: "Security wording usually matters, but often needs surrounding context to assess severity.", tags: ["security"] },
];

function normalizeText(text: string) {
  return String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 64);
}

function tokenize(text: string) {
  return normalizeText(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function splitIntoClauses(rawText: string) {
  const text = normalizeText(rawText);
  return text.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean).map((section, index) => {
    const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
    const heading = lines[0] && lines[0].length <= 90 ? lines[0].replace(/^[-*#\d.\s]+/, "").trim() : `Clause ${index + 1}`;
    return { id: `${index + 1}-${slugify(heading || `clause-${index + 1}`)}`, heading: heading || `Clause ${index + 1}`, text: lines.join(" "), tokens: tokenize(lines.join(" ")) };
  });
}

function jaccardSimilarity(tokensA: string[], tokensB: string[]) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const token of a) { if (b.has(token)) intersection++; }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function classifyRisk(text: string) {
  const lower = text.toLowerCase();
  const matches = RISK_RULES.filter((rule) => rule.keywords.some((kw) => lower.includes(kw)));
  if (!matches.length) return { label: "General wording change", level: "low", score: 1, why: "The language changed, but it does not strongly match a high-signal legal or privacy risk pattern.", tags: ["general"] };
  return matches.sort((a, b) => b.score - a.score)[0];
}

function changeTypeLabel(kind: string) {
  if (kind === "added") return "Added clause";
  if (kind === "removed") return "Removed clause";
  return "Modified clause";
}

function explainChange(kind: string, prev: string, curr: string) {
  if (kind === "added") return "This language appears in the new version and creates a fresh obligation, permission, or disclosure.";
  if (kind === "removed") return "This language existed before but no longer appears, which may reduce a user protection or a provider commitment.";
  const bl = tokenize(prev).length, al = tokenize(curr).length;
  if (al > bl) return "The clause was broadened with additional language, suggesting expanded scope or new conditions.";
  if (al < bl) return "The clause was tightened or shortened, which can narrow earlier promises or remove detail.";
  return "The clause changed in wording without a major size shift, so the meaning likely moved subtly rather than structurally.";
}

function buildSummary(changes: any[], metrics: any) {
  if (!changes.length) return ["No meaningful clause changes were detected between these two versions.", "The document structure and wording remained effectively the same."];
  const bullets: string[] = [`${metrics.total} clause changes detected across ${metrics.modified} modified, ${metrics.added} added, and ${metrics.removed} removed sections.`];
  const high = changes.filter((c) => c.riskLevel === "high").slice(0, 2);
  if (high.length) bullets.push(`High-risk movement appears in ${high.map((c) => c.heading).join(" and ")}.`);
  const themes = [...new Set(changes.map((c) => c.riskLabel))].slice(0, 2) as string[];
  if (themes.length) bullets.push(`The biggest themes are ${themes.join(" plus ")}.`);
  bullets.push(metrics.highRisk ? "Review the highlighted clauses before accepting the new terms, especially where rights or data use expanded." : "Most changes look low-to-medium impact, but the revised language still merits a quick human review.");
  return bullets.slice(0, 5);
}

function buildWhyMatters(changes: any[]) {
  const reasons: string[] = [];
  changes.forEach((c) => { if (c.whyItMatters && !reasons.includes(c.whyItMatters)) reasons.push(c.whyItMatters); });
  return reasons.length ? reasons.slice(0, 5) : ["The versions are materially aligned, so no urgent follow-up is signaled."];
}

function buildSingleDocSummary(changes: any[], metrics: any) {
  if (!changes.length) return ["No reviewable clauses were detected in the submitted text.", "Try pasting a longer policy section with clear headings or paragraph breaks."];
  const bullets: string[] = [`${metrics.total} clauses flagged for review across the submitted policy text.`];
  const high = changes.filter((c) => c.riskLevel === "high").slice(0, 2);
  if (high.length) bullets.push(`Highest-priority language appears in ${high.map((c) => c.heading).join(" and ")}.`);
  const themes = [...new Set(changes.map((c) => c.riskLabel))].slice(0, 2) as string[];
  if (themes.length) bullets.push(`Key themes include ${themes.join(" and ")}.`);
  bullets.push(metrics.highRisk ? "Review the highlighted clauses before accepting or signing this policy." : "Most flagged clauses look lower urgency, but the full text still merits a human review.");
  return bullets.slice(0, 5);
}

function runSingleDocumentAnalysis(text: string) {
  const clauses = splitIntoClauses(text);
  const changes = clauses.map((clause) => {
    const risk = classifyRisk(clause.text);
    return { id: clause.id, heading: clause.heading, changeType: "review", changeLabel: "Clause flagged", beforeText: "", afterText: clause.text, riskLevel: risk.level, riskLabel: risk.label, riskScore: risk.score, whyItMatters: risk.why, summary: `This clause contains language that may warrant review under ${risk.label.toLowerCase()} themes.`, tags: [...risk.tags, "review"], similarity: 0 };
  });
  const sorted = changes.sort((a, b) => b.riskScore - a.riskScore);
  const metrics = { total: sorted.length, added: 0, removed: 0, modified: 0, reviewed: sorted.length, highRisk: sorted.filter((c) => c.riskLevel === "high").length, mediumRisk: sorted.filter((c) => c.riskLevel === "medium").length, lowRisk: sorted.filter((c) => c.riskLevel === "low").length, score: Math.min(99, sorted.reduce((s, c) => s + c.riskScore * 9, 0)) };
  return { overview: { headline: metrics.highRisk > 0 ? `${metrics.highRisk} high-risk clauses need review` : metrics.total > 0 ? "Policy clauses flagged for review" : "No reviewable clauses detected", summaryBullets: buildSingleDocSummary(sorted, metrics), whyMatters: buildWhyMatters(sorted), disclaimer: "Informational output only. TermsWatch surfaces change intelligence and risk signals, not legal advice.", confidence: metrics.total ? "medium" : "high", modelMode: "deterministic fallback", comparisonKind: "single" }, metrics, changes: sorted };
}

function runDeterministicAnalysis(previousText: string, currentText: string) {
  const prevClauses = splitIntoClauses(previousText);
  const currClauses = splitIntoClauses(currentText);
  const usedCurr = new Set<number>();
  const changes: any[] = [];

  for (const pc of prevClauses) {
    let best: { score: number; clause: any; index: number } | null = null;
    currClauses.forEach((cc, i) => {
      if (usedCurr.has(i)) return;
      const score = jaccardSimilarity(pc.tokens, cc.tokens);
      if (!best || score > best.score) best = { score, clause: cc, index: i };
    });
    if (!best || best.score < 0.22) {
      const risk = classifyRisk(pc.text);
      changes.push({ id: pc.id, heading: pc.heading, changeType: "removed", changeLabel: changeTypeLabel("removed"), beforeText: pc.text, afterText: "", riskLevel: risk.level, riskLabel: risk.label, riskScore: risk.score, whyItMatters: risk.why, summary: explainChange("removed", pc.text, ""), tags: [...risk.tags, "removed"], similarity: 0 });
      continue;
    }
    usedCurr.add(best.index);
    if (best.score < 0.97) {
      const risk = classifyRisk(`${pc.text} ${best.clause.text}`);
      changes.push({ id: best.clause.id, heading: best.clause.heading, changeType: "modified", changeLabel: changeTypeLabel("modified"), beforeText: pc.text, afterText: best.clause.text, riskLevel: risk.level, riskLabel: risk.label, riskScore: risk.score, whyItMatters: risk.why, summary: explainChange("modified", pc.text, best.clause.text), tags: [...risk.tags, "modified"], similarity: Number(best.score.toFixed(2)) });
    }
  }

  currClauses.forEach((cc, i) => {
    if (usedCurr.has(i)) return;
    const risk = classifyRisk(cc.text);
    changes.push({ id: cc.id, heading: cc.heading, changeType: "added", changeLabel: changeTypeLabel("added"), beforeText: "", afterText: cc.text, riskLevel: risk.level, riskLabel: risk.label, riskScore: risk.score, whyItMatters: risk.why, summary: explainChange("added", "", cc.text), tags: [...risk.tags, "added"], similarity: 0 });
  });

  const sorted = changes.sort((a, b) => b.riskScore - a.riskScore);
  const metrics = { total: sorted.length, added: sorted.filter((c) => c.changeType === "added").length, removed: sorted.filter((c) => c.changeType === "removed").length, modified: sorted.filter((c) => c.changeType === "modified").length, highRisk: sorted.filter((c) => c.riskLevel === "high").length, mediumRisk: sorted.filter((c) => c.riskLevel === "medium").length, lowRisk: sorted.filter((c) => c.riskLevel === "low").length, score: Math.min(99, sorted.reduce((s, c) => s + c.riskScore * 9, 0)) };
  return { overview: { headline: metrics.highRisk > 0 ? `${metrics.highRisk} high-risk changes need review` : metrics.total > 0 ? "Changes detected with low-to-medium materiality" : "No material changes detected", summaryBullets: buildSummary(sorted, metrics), whyMatters: buildWhyMatters(sorted), disclaimer: "Informational output only. TermsWatch surfaces change intelligence and risk signals, not legal advice.", confidence: metrics.total ? "medium" : "high", modelMode: "deterministic fallback", comparisonKind: "diff" }, metrics, changes: sorted };
}

// ─── URL extraction ──────────────────────────────────────────────────────────

const SAMPLE_TEXTS: Record<string, { title: string; text: string }> = {
  "https://demo.termswatch.app/privacy/v1": { title: "Privacy Policy Demo (previous)", text: `Privacy Policy\n\nData We Collect\nWe collect account details, basic usage information, and device identifiers needed to operate the service.\n\nHow We Use Data\nWe use personal information to provide the service, secure accounts, and send service updates.\n\nSharing Information\nWe do not sell personal information. We share data with service providers only to support operations on our behalf.\n\nRetention\nWe keep account data for as long as the account remains active and remove deleted account data within 30 days.\n\nDisputes\nDisputes may be brought in local courts where required by law.` },
  "https://demo.termswatch.app/privacy/v2": { title: "Privacy Policy Demo (current)", text: `Privacy Policy\n\nData We Collect\nWe collect account details, device identifiers, approximate location, and product interaction data to operate and improve the service.\n\nHow We Use Data\nWe use personal information to provide the service, personalize the product experience, train internal models, and send service updates.\n\nSharing Information\nWe may share personal information with affiliates, analytics partners, and advertising partners to measure campaigns and improve recommendations. We do not sell personal information for money.\n\nRetention\nWe may retain account data for as long as needed for legal, security, analytics, and backup purposes, even after account closure.\n\nDispute Resolution\nAny dispute will be resolved through binding arbitration on an individual basis, and users waive participation in class actions.\n\nBilling\nPaid plans automatically renew unless canceled before the renewal date. Fees are non-refundable except where required by law.` },
  "https://demo.termswatch.app/terms/v1": { title: "SaaS Terms Demo (previous)", text: `Terms of Service\n\nFees\nCustomers are billed monthly based on active seats. Fees are payable within 30 days of invoice.\n\nRenewal\nSubscriptions renew for successive one-month terms unless either party gives 15 days' notice before renewal.\n\nSuspension\nWe may suspend access for non-payment after giving reasonable notice and an opportunity to cure.\n\nLiability\nOur aggregate liability is limited to the fees paid under this agreement during the prior 12 months.\n\nTermination\nEither party may terminate for material breach if the breach remains uncured for 30 days after written notice.` },
  "https://demo.termswatch.app/terms/v2": { title: "SaaS Terms Demo (current)", text: `Terms of Service\n\nFees\nCustomers are billed annually in advance based on committed seats. Fees are due upon invoice and are non-refundable except where required by law.\n\nRenewal\nSubscriptions automatically renew for additional 12-month terms unless canceled at least 45 days before renewal.\n\nSuspension\nWe may suspend access immediately for suspected misuse, security concerns, or non-payment.\n\nLiability\nOur aggregate liability is limited to the lesser of fees paid in the prior three months or $500.\n\nTermination\nWe may terminate the service immediately for policy violations. Customers may terminate only at the end of the current subscription term.` },
  "https://demo.termswatch.app/security/v1": { title: "Security Notice Demo (previous)", text: `Security Notice\n\nIncident Notification\nIf we confirm unauthorized access to customer data, we will notify affected customers without undue delay and no later than 72 hours after confirmation.\n\nSubprocessors\nWe maintain a list of subprocessors and provide 15 days' notice before adding a new subprocessor.\n\nAudit Support\nCustomers may request one security questionnaire response per year and a copy of our most recent SOC 2 report.` },
  "https://demo.termswatch.app/security/v2": { title: "Security Notice Demo (current)", text: `Security Notice\n\nIncident Notification\nIf we suspect or confirm unauthorized access to customer data, we may notify affected customers as soon as reasonably practicable, taking into account the needs of law enforcement and remediation.\n\nSubprocessors\nWe may engage new subprocessors at any time and will update our list periodically.\n\nAudit Support\nCustomers may review summary security materials made available in our trust center. We may decline repeated or overly burdensome requests.` },
};

function htmlToPlainText(html: string): string {
  // Strip script/style blocks
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Convert block elements to newlines
  text = text.replace(/<(p|div|br|h[1-6]|li|tr)[^>]*>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function resolveSource(kind: string, value: string, label: string) {
  if (kind === "text") {
    return { label, mode: "text", value, content: normalizeText(value), title: label };
  }
  if (!value.trim()) {
    return { label, mode: kind, value: "", content: "", title: "Not provided" };
  }
  const demo = SAMPLE_TEXTS[value.trim()];
  if (demo) {
    return { label, mode: "url", value, content: demo.text, title: demo.title };
  }
  const response = await fetch(value, { headers: { "user-agent": "TermsWatch/1.0", accept: "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new Error(`Failed to fetch ${label.toLowerCase()} (${response.status})`);
  const html = await response.text();
  const content = htmlToPlainText(html);
  if (!content) throw new Error(`Could not extract readable content from ${label.toLowerCase()}`);
  return { label, mode: "url", value, content, title: value };
}

// ─── LLM enhancement ─────────────────────────────────────────────────────────

const ANALYST_INSTRUCTIONS = "You are a policy-comparison analyst. Improve the baseline change review, keep the disclaimer stance informational only, and do not invent changes that are not grounded in the provided text.";

function resolveModel(model: string) {
  if (!model || model === "default" || model === "openrouter/free") {
    return Deno.env.get("OPENROUTER_API_KEY") ? "openrouter/free" : (Deno.env.get("OPENAI_API_KEY") ? "gpt-4o-mini" : "openrouter/free");
  }
  return model;
}

function getLLMClient() {
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (openrouterKey) {
    const headers: Record<string, string> = {};
    const siteUrl = Deno.env.get("OPENROUTER_SITE_URL");
    const appName = Deno.env.get("OPENROUTER_APP_NAME");
    if (siteUrl) headers["HTTP-Referer"] = siteUrl;
    if (appName) headers["X-Title"] = appName;
    return new OpenAI({ apiKey: openrouterKey, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: headers });
  }
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) return new OpenAI({ apiKey: openaiKey });
  return null;
}

async function runLLMEnhancement(previousText: string, currentText: string, baseline: any, model: string) {
  const client = getLLMClient();
  if (!client) return null;

  const payload = JSON.stringify({ previousText: previousText.slice(0, 16000), currentText: currentText.slice(0, 16000), baseline }, null, 2);

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${ANALYST_INSTRUCTIONS} Return only valid JSON with keys: headline, confidence, summaryBullets, whyMatters, changeOverrides.` },
        { role: "user", content: payload },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function mergeChanges(baseChanges: any[], overrides: any[]) {
  const map = new Map(overrides.map((o: any) => [o.id, o]));
  return baseChanges.map((c) => {
    const o = map.get(c.id);
    return o ? { ...c, riskLevel: o.riskLevel, riskLabel: o.riskLabel, summary: o.summary, whyItMatters: o.whyItMatters, tags: o.tags } : c;
  });
}

function buildRunLog(mode: string, metrics: any, modelMode: string, note: string) {
  return [
    { title: "Sources ingested", detail: mode === "url" ? "Fetched and extracted both URLs on the server." : "Accepted both pasted policy texts for direct processing." },
    { title: "Clauses normalized", detail: "Cleaned noisy markup, segmented the text, and mapped likely sections." },
    { title: "Baseline diff complete", detail: `Matched document sections and found ${metrics.total} changed clauses.` },
    { title: "Risk evaluation complete", detail: `Ranked ${metrics.highRisk} high-risk changes using ${modelMode}.` },
    { title: "Summary generated", detail: note },
  ];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return err("Authentication required.", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return err("Authentication required.", 401);

    // Parse body
    const body = await req.json();
    const { mode, model = "openrouter/free", previous, current } = body;

    if (!mode || !previous || !current) return err("mode, previous, and current are required.");

    // Resolve sources
    const [prevSource, currSource] = await Promise.all([
      resolveSource(previous.kind, previous.value || "", "Original policy"),
      resolveSource(current.kind, current.value || "", "Updated policy"),
    ]);

    const prevText = prevSource.content;
    const currText = currSource.content;
    const hasPrev = Boolean(normalizeText(prevText));
    const hasCurr = Boolean(normalizeText(currText));

    if (!hasPrev && !hasCurr) return err("Provide policy text or a URL to analyze.");

    // Deterministic baseline
    const baseline = hasPrev && hasCurr ? runDeterministicAnalysis(prevText, currText) : runSingleDocumentAnalysis(hasCurr ? currText : prevText);

    // LLM enhancement
    const resolvedModel = resolveModel(model);
    let modelMode = "deterministic fallback";
    let enhancementNote = "Prepared executive takeaways, why-it-matters notes, and review guidance.";
    let changes = baseline.changes;
    let overview = { ...baseline.overview };

    const enhanced = await runLLMEnhancement(prevText, currText, baseline, resolvedModel);
    if (enhanced) {
      modelMode = "LLM enhanced";
      enhancementNote = "Model reasoning upgraded headlines, summaries, and clause explanations.";
      changes = mergeChanges(baseline.changes, enhanced.changeOverrides || []);
      overview = {
        ...baseline.overview,
        headline: enhanced.headline || baseline.overview.headline,
        confidence: enhanced.confidence || baseline.overview.confidence,
        summaryBullets: enhanced.summaryBullets || baseline.overview.summaryBullets,
        whyMatters: enhanced.whyMatters || baseline.overview.whyMatters,
        modelMode,
        comparisonKind: baseline.overview.comparisonKind,
      };
    } else {
      overview.modelMode = modelMode;
    }

    // Save report
    const { data: savedReport, error: saveError } = await supabase.from("reports").insert({
      user_id: user.id,
      created_at: new Date().toISOString(),
      mode,
      headline: overview.headline || "",
      model_mode: modelMode,
      metrics: baseline.metrics,
      sources: {
        previous: { label: prevSource.label, value: prevSource.value, title: prevSource.title, mode: prevSource.mode },
        current: { label: currSource.label, value: currSource.value, title: currSource.title, mode: currSource.mode },
      },
      overview,
      changes,
      run_log: buildRunLog(mode, baseline.metrics, modelMode, enhancementNote),
    }).select().single();

    if (saveError) return err(saveError.message, 500);

    const report = {
      id: savedReport.id,
      userId: savedReport.user_id,
      createdAt: savedReport.created_at,
      mode: savedReport.mode,
      sources: savedReport.sources,
      overview: savedReport.overview,
      metrics: savedReport.metrics,
      changes: savedReport.changes,
      runLog: savedReport.run_log,
    };

    return ok({ report });
  } catch (e: any) {
    return err(e?.message ?? "Comparison failed.", 500);
  }
});
