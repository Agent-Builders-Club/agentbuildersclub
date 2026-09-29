-- Synthetic public skill projection. No seed/import of hosted Supabase rows.
-- agent_id intentionally has no FK, matching the source skills table.
CREATE TABLE skills (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  trigger_phrases TEXT NOT NULL CHECK (json_valid(trigger_phrases) AND json_type(trigger_phrases) = 'array'),
  instructions TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  agent_id TEXT,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
  flagged INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1)),
  install_count INTEGER NOT NULL DEFAULT 0 CHECK (install_count >= 0),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??.???Z')
);
CREATE TRIGGER skills_phrases_insert BEFORE INSERT ON skills
WHEN EXISTS (SELECT 1 FROM json_each(NEW.trigger_phrases) WHERE type != 'text')
BEGIN SELECT RAISE(ABORT, 'trigger_phrases must contain strings'); END;
CREATE TRIGGER skills_phrases_update BEFORE UPDATE OF trigger_phrases ON skills
WHEN EXISTS (SELECT 1 FROM json_each(NEW.trigger_phrases) WHERE type != 'text')
BEGIN SELECT RAISE(ABORT, 'trigger_phrases must contain strings'); END;
CREATE INDEX skills_public_order ON skills(install_count DESC, created_at DESC)
WHERE approved = 1 AND flagged = 0;
