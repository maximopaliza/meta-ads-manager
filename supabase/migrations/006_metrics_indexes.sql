-- Performance indexes for metrics table (frequent range queries)
CREATE INDEX IF NOT EXISTS idx_metrics_type_date  ON metrics(object_type, date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_object_date ON metrics(object_id, date DESC);

-- Index for video_analysis cache lookups
CREATE INDEX IF NOT EXISTS idx_video_analysis_file ON video_analysis(drive_file_id);

-- Index for campaign_drafts status filter
CREATE INDEX IF NOT EXISTS idx_drafts_status_created ON campaign_drafts(status, created_at DESC);
