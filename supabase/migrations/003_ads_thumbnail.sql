-- Add thumbnail_url column to ads table for Meta creative thumbnails
ALTER TABLE ads ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
