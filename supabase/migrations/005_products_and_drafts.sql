-- Products table (editable from dashboard)
CREATE TABLE IF NOT EXISTS products (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  brand       TEXT NOT NULL,
  tagline     TEXT,
  price       TEXT,
  conditions  TEXT,
  url         TEXT,
  reviews     TEXT,
  benefits    JSONB DEFAULT '[]',
  audiences   JSONB DEFAULT '[]',
  differentiators JSONB DEFAULT '[]',
  testimonials    JSONB DEFAULT '[]',
  copy_rules      JSONB DEFAULT '{}',
  extra_data      JSONB DEFAULT '{}',
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign drafts tracker (Meta campaigns created as PAUSED)
CREATE TABLE IF NOT EXISTS campaign_drafts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id     TEXT NOT NULL,
  ad_set_id       TEXT,
  campaign_name   TEXT NOT NULL,
  ad_set_name     TEXT,
  campaign_type   TEXT DEFAULT 'CBO',   -- CBO | ABO
  budget_cents    INTEGER,
  budget_level    TEXT DEFAULT 'campaign', -- campaign | adset
  objective       TEXT DEFAULT 'ventas',
  status          TEXT DEFAULT 'PAUSED',  -- PAUSED | ACTIVE | DELETED
  ads             JSONB DEFAULT '[]',     -- [{ad_id, name, drive_file_id, angle, headline, primary_text}]
  product_id      UUID REFERENCES products(id),
  start_date      DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_status ON campaign_drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_created ON campaign_drafts(created_at DESC);

-- video_analysis table (may already exist from bot — safe with IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS video_analysis (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  drive_file_id   TEXT UNIQUE NOT NULL,
  file_name       TEXT,
  angle           TEXT,
  analysis        TEXT,
  primary_text    TEXT,
  headline        TEXT,
  audience_summary TEXT,
  targeting       JSONB DEFAULT '{}',
  full_response   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
