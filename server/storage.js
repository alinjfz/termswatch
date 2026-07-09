import { supabaseAdmin } from './supabase.js';

function toReport(row) {
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

function toCompactReport(row) {
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

export async function saveReport(report, userId) {
  const payload = {
    user_id: userId,
    created_at: report.createdAt || new Date().toISOString(),
    mode: report.mode || 'text',
    headline: report.overview?.headline || '',
    model_mode: report.overview?.modelMode || '',
    metrics: report.metrics || {},
    sources: report.sources || {},
    overview: report.overview || {},
    changes: report.changes || [],
    run_log: report.runLog || [],
  };

  if (report.id) {
    payload.id = report.id;
  }

  const { data, error } = await supabaseAdmin
    .from('reports')
    .upsert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return toReport(data);
}

export async function listReports(userId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('id, created_at, mode, headline, model_mode, metrics, sources')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data || []).map(toCompactReport);
}

export async function getReport(id, userId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toReport(data) : null;
}

export async function getUserDashboardStats(userId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('metrics')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  const reports = data || [];
  return {
    totalComparisons: reports.length,
    highRiskFlags: reports.reduce((sum, r) => sum + (r.metrics?.highRisk || 0), 0),
    totalChangedClauses: reports.reduce((sum, r) => sum + (r.metrics?.total || 0), 0),
  };
}
