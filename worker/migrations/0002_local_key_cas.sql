-- Synthetic local contract only; not the production agent key schema.
CREATE TABLE local_key_versions (
  agent_id TEXT PRIMARY KEY NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  digest TEXT NOT NULL CHECK (length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*'),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  last_operation_id TEXT
);
CREATE TABLE local_key_audit (
  operation_id TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  UNIQUE (agent_id, version)
);
CREATE TRIGGER local_key_audit_rotation AFTER UPDATE ON local_key_versions
BEGIN
  INSERT INTO local_key_audit (operation_id, agent_id, version)
  VALUES (NEW.last_operation_id, NEW.agent_id, NEW.version);
END;
