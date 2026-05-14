CREATE TABLE ad_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES ad_accounts(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  objective TEXT,
  daily_budget NUMERIC,
  lifetime_budget NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ad_sets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  daily_budget NUMERIC,
  targeting JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ads (
  id TEXT PRIMARY KEY,
  ad_set_id TEXT REFERENCES ad_sets(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  creative_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('campaign', 'ad_set', 'ad')),
  date DATE NOT NULL,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  purchase_value NUMERIC DEFAULT 0,
  cpc NUMERIC,
  cpm NUMERIC,
  roas NUMERIC,
  frequency NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(object_id, object_type, date)
);

CREATE TABLE alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('anomaly', 'recommendation', 'milestone')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  object_id TEXT,
  sent_to_telegram BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_object ON metrics(object_id, date DESC);
CREATE INDEX idx_alerts_unsent ON alerts(sent_to_telegram) WHERE sent_to_telegram = FALSE;
CREATE INDEX idx_metrics_date ON metrics(date DESC);
