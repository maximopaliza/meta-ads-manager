-- Track which Drive video corresponds to each ad
ALTER TABLE ads ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS drive_folder TEXT DEFAULT 'Nuevos subidos';

-- Copy performance history (reference for new campaigns)
CREATE TABLE IF NOT EXISTS copy_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  ad_id TEXT,
  angle TEXT,
  primary_text TEXT,
  headline TEXT,
  destination_url TEXT,
  final_folder TEXT,          -- winners, malos, poco_gasto, quemados
  total_spend NUMERIC DEFAULT 0,
  total_purchases INTEGER DEFAULT 0,
  avg_cpa NUMERIC,
  avg_roas NUMERIC,
  active_days INTEGER DEFAULT 0,
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video analysis cache (Gemini results per Drive file)
CREATE TABLE IF NOT EXISTS video_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  file_name TEXT,
  angle TEXT,
  analysis TEXT,
  primary_text TEXT,
  headline TEXT,
  audience_summary TEXT,
  targeting JSONB,
  full_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix alerts type constraint to include day_analysis
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
  CHECK (type IN ('anomaly', 'recommendation', 'milestone', 'day_analysis', 'trend'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ads_drive_file ON ads(drive_file_id) WHERE drive_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copy_history_angle ON copy_history(angle, final_folder);
