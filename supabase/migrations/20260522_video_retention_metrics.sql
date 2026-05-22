-- Migración: métricas de retención de video
-- Ejecutar en Supabase SQL Editor
-- 2026-05-22

ALTER TABLE metrics
  -- Vistas en milestones de retención (conteo absoluto de personas)
  ADD COLUMN IF NOT EXISTS video_3s_views       INTEGER,
  ADD COLUMN IF NOT EXISTS video_p25_watched    INTEGER,
  ADD COLUMN IF NOT EXISTS video_p50_watched    INTEGER,
  ADD COLUMN IF NOT EXISTS video_p75_watched    INTEGER,
  ADD COLUMN IF NOT EXISTS video_p95_watched    INTEGER,
  ADD COLUMN IF NOT EXISTS video_thruplay       INTEGER,

  -- Tasas derivadas (%)
  -- hold_rate    = video_p50_watched / video_3s_views × 100
  --                % de los que pasaron los 3s que también llegaron al 50% del video
  ADD COLUMN IF NOT EXISTS hold_rate            NUMERIC(6,2),

  -- thruplay_rate = video_thruplay / impressions × 100
  --                 % de impresiones que llegaron al 95% (o 15s en videos largos)
  ADD COLUMN IF NOT EXISTS thruplay_rate        NUMERIC(6,2),

  -- ctr_post_view = unique_link_clicks / video_3s_views × 100
  --                 de los que vieron 3s, qué % hizo clic → efectividad del CTA/oferta
  ADD COLUMN IF NOT EXISTS ctr_post_view        NUMERIC(6,2);

-- Índice para acelerar queries de diagnóstico por nivel ad
CREATE INDEX IF NOT EXISTS idx_metrics_ad_date
  ON metrics (object_type, date)
  WHERE object_type = 'ad';
