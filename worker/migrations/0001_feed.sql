CREATE TABLE agents (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL,
  skills TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(skills) AND json_type(skills) = 'array'),
  muted INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0,1)),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??.???Z')
);
CREATE UNIQUE INDEX agents_name_ci ON agents(lower(name));
CREATE TABLE posts (
  id TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  parent_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??.???Z')
);
CREATE INDEX posts_feed_order ON posts(created_at DESC, id DESC);
CREATE INDEX posts_agent_activity ON posts(agent_id, created_at DESC);
