import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

const SAMPLE_POLICIES = [
  {
    id: "privacy-demo",
    name: "Privacy Policy Demo",
    category: "Vendor privacy policy",
    recommendedMode: "url",
    expectedOutcome: "High-risk sharing and dispute changes",
    description: "Shows privacy sharing, retention, arbitration, and billing changes.",
    previousUrl: "https://demo.termswatch.app/privacy/v1",
    currentUrl: "https://demo.termswatch.app/privacy/v2",
  },
  {
    id: "saas-terms-demo",
    name: "SaaS Terms Demo",
    category: "Commercial terms",
    recommendedMode: "text",
    expectedOutcome: "Liability and renewal risk increases",
    description: "Useful for testing text mode, limitation of liability changes, and termination language.",
    previousUrl: "https://demo.termswatch.app/terms/v1",
    currentUrl: "https://demo.termswatch.app/terms/v2",
  },
  {
    id: "security-notice-demo",
    name: "Security Notice Demo",
    category: "Security and incident notice",
    recommendedMode: "text",
    expectedOutcome: "Shorter notice windows and broader disclosure rights",
    description: "Good for checking clause extraction on a smaller document and reviewing incident-response language.",
    previousUrl: "https://demo.termswatch.app/security/v1",
    currentUrl: "https://demo.termswatch.app/security/v2",
  },
];

function toCompact(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    mode: row.mode,
    headline: row.headline,
    metrics: row.metrics,
    sources: row.sources,
    modelMode: row.model_mode,
    overview: { headline: row.headline, modelMode: row.model_mode },
  };
}

function toReport(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    mode: row.mode,
    sources: row.sources,
    overview: row.overview,
    metrics: row.metrics,
    changes: row.changes,
    runLog: row.run_log,
  };
}

async function getAuthedUser(req: Request, supabase: any) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Strip everything up to and including /api from the path
    // e.g. /functions/v1/api/auth/me → /auth/me
    const path = url.pathname.replace(/^.*\/api/, "") || "/";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Public: health check
    if (path === "/health") {
      const hasAI = Boolean(Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("OPENAI_API_KEY"));
      return ok({ ok: true, ai: { configured: hasAI, provider: hasAI ? "Model API" : null, defaultModel: "openrouter/free", message: hasAI ? "Live model reasoning is available." : "Deterministic comparison is active." } });
    }

    // Public: samples list
    if (path === "/samples") {
      return ok({ samples: SAMPLE_POLICIES });
    }

    // All remaining routes require auth
    const user = await getAuthedUser(req, supabase);
    if (!user) return err("Authentication required.", 401);

    // GET /auth/me — dashboard stats
    if (path === "/auth/me") {
      const { data, error } = await supabase.from("reports").select("metrics").eq("user_id", user.id);
      if (error) return err(error.message, 500);
      const reports = data || [];
      return ok({
        user: { id: user.id, name: user.user_metadata?.name || user.email?.split("@")[0] || "", email: user.email, createdAt: user.created_at },
        stats: {
          totalComparisons: reports.length,
          highRiskFlags: reports.reduce((s: number, r: any) => s + (r.metrics?.highRisk || 0), 0),
          totalChangedClauses: reports.reduce((s: number, r: any) => s + (r.metrics?.total || 0), 0),
        },
      });
    }

    // GET /history
    if (path === "/history") {
      const { data, error } = await supabase.from("reports").select("id, created_at, mode, headline, model_mode, metrics, sources").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
      if (error) return err(error.message, 500);
      return ok({ reports: (data || []).map(toCompact) });
    }

    // GET /report/:id
    const reportMatch = path.match(/^\/report\/([^/]+)$/);
    if (reportMatch) {
      const { data, error } = await supabase.from("reports").select("*").eq("id", reportMatch[1]).eq("user_id", user.id).maybeSingle();
      if (error) return err(error.message, 500);
      if (!data) return err("Report not found.", 404);
      return ok({ report: toReport(data) });
    }

    // GET /export/:id
    const exportMatch = path.match(/^\/export\/([^/]+)$/);
    if (exportMatch) {
      const { data, error } = await supabase.from("reports").select("*").eq("id", exportMatch[1]).eq("user_id", user.id).maybeSingle();
      if (error) return err(error.message, 500);
      if (!data) return err("Report not found.", 404);
      const r = toReport(data);
      const lines = [
        "# TermsWatch Report",
        "",
        `Generated: ${new Date(r.createdAt).toLocaleString()}`,
        `Headline: ${r.overview.headline}`,
        `Model mode: ${r.overview.modelMode}`,
        "",
        "## Summary",
        ...(r.overview.summaryBullets || []).map((b: string) => `- ${b}`),
        "",
        "## Why This Matters",
        ...(r.overview.whyMatters || []).map((b: string) => `- ${b}`),
        "",
        "## Changed Clauses",
        ...(r.changes || []).flatMap((c: any) => [
          `### ${c.heading}`,
          `- Change: ${c.changeLabel}`,
          `- Risk: ${c.riskLevel} / ${c.riskLabel}`,
          `- Summary: ${c.summary}`,
          `- Why it matters: ${c.whyItMatters}`,
          "",
          "Before:",
          c.beforeText || "None",
          "",
          "After:",
          c.afterText || "None",
          "",
        ]),
      ].join("\n");

      return new Response(lines, {
        headers: {
          ...corsHeaders,
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="termswatch-${data.id}.md"`,
        },
      });
    }

    return err("Not found.", 404);
  } catch (e: any) {
    return err(e?.message ?? "Internal error.", 500);
  }
});
