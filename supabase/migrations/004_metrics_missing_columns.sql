-- Add all columns that sync writes but were never migrated
ALTER TABLE metrics
  ADD COLUMN IF NOT EXISTS link_clicks          INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_link_clicks   INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach                INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS add_to_cart          INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_atc         NUMERIC,
  ADD COLUMN IF NOT EXISTS landing_page_views   INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkout_initiated   INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctr                  NUMERIC,
  ADD COLUMN IF NOT EXISTS cpa                  NUMERIC,
  ADD COLUMN IF NOT EXISTS hook_rate            NUMERIC,
  ADD COLUMN IF NOT EXISTS video_avg_time_watched NUMERIC;
