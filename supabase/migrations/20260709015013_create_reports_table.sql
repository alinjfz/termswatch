/*
# Create reports table for TermsWatch

## Summary
Replaces the file-based JSON persistence layer with a proper Supabase database table.
Reports are owned by authenticated users and scoped to their account via RLS.

## New Tables

### `reports`
- `id` (uuid, primary key) — unique report identifier
- `user_id` (uuid, not null, default auth.uid()) — owning user, references auth.users
- `created_at` (timestamptz, not null) — when the report was generated
- `mode` (text, not null) — 'url' or 'text' comparison mode
- `headline` (text) — short summary headline, extracted from overview for fast listing
- `model_mode` (text) — which AI model mode was used (stored for list view)
- `metrics` (jsonb, not null) — total/highRisk/modified/added/removed/score counts
- `sources` (jsonb, not null) — previous and current source metadata
- `overview` (jsonb, not null) — full executive summary object (headline, bullets, whyMatters, disclaimer)
- `changes` (jsonb, not null) — array of clause-level change objects
- `run_log` (jsonb, not null) — pipeline run step log

## Security

- RLS enabled on `reports`.
- Authenticated users can only SELECT, INSERT, UPDATE, DELETE their own rows (auth.uid() = user_id).
- user_id defaults to auth.uid() so the frontend can omit it on insert.

## Notes

1. The `headline` and `model_mode` columns are denormalized from `overview` for efficient listing queries.
2. The server-side admin client bypasses RLS but enforces ownership in application code.
3. Limit of 200 reports per query replaces the old 500-report JSON cap.
*/

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL DEFAULT 'text',
  headline text NOT NULL DEFAULT '',
  model_mode text NOT NULL DEFAULT '',
  metrics jsonb NOT NULL DEFAULT '{}',
  sources jsonb NOT NULL DEFAULT '{}',
  overview jsonb NOT NULL DEFAULT '{}',
  changes jsonb NOT NULL DEFAULT '[]',
  run_log jsonb NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS reports_user_id_created_at_idx ON reports (user_id, created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_reports" ON reports;
CREATE POLICY "select_own_reports" ON reports FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reports" ON reports;
CREATE POLICY "insert_own_reports" ON reports FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reports" ON reports;
CREATE POLICY "update_own_reports" ON reports FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reports" ON reports;
CREATE POLICY "delete_own_reports" ON reports FOR DELETE
TO authenticated USING (auth.uid() = user_id);
