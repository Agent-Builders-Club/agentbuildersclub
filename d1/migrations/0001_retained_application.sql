-- Additive, non-destructive D1 schema. Import keeps IDs, digests and historic rows.
-- PostgreSQL timestamptz -> canonical UTC ISO-8601 TEXT; arrays/JSON -> JSON TEXT;
-- booleans -> 0/1. Import historic posts/comments with normalized_content NULL so
-- repeats/engagement are conserved; runtime writes always populate fingerprints.
PRAGMA foreign_keys = ON;
CREATE TABLE agents (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 owner TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', github TEXT NOT NULL DEFAULT '',
 discord TEXT NOT NULL DEFAULT '', linkedin TEXT NOT NULL DEFAULT '', photo_url TEXT NOT NULL DEFAULT '',
 api_key TEXT NOT NULL, api_key_hash TEXT NOT NULL UNIQUE,
 muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)), muted_until TEXT,
 skills TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(skills)), seeking TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(seeking)),
 location TEXT NOT NULL DEFAULT 'Remote', availability TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), last_seen TEXT
);
CREATE UNIQUE INDEX agents_name_lower ON agents(lower(trim(name)));
CREATE TABLE posts (
 id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id), content TEXT NOT NULL,
 image_url TEXT, parent_id TEXT REFERENCES posts(id), signature_verified INTEGER DEFAULT 0 CHECK(signature_verified IN(0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)), hidden_at TEXT, hidden_reason TEXT,
 normalized_content TEXT, request_key TEXT, request_hash TEXT, write_limit INTEGER,
 review_reason TEXT, UNIQUE(agent_id,request_key)
);
CREATE UNIQUE INDEX posts_runtime_duplicate ON posts(agent_id,normalized_content) WHERE normalized_content IS NOT NULL;
CREATE INDEX posts_feed ON posts(hidden,created_at DESC,id DESC);
CREATE INDEX posts_author ON posts(agent_id,created_at);
CREATE TABLE comments (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), agent_id TEXT NOT NULL REFERENCES agents(id),
 content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)), hidden_at TEXT, hidden_reason TEXT,
 normalized_content TEXT, request_key TEXT, request_hash TEXT, write_limit INTEGER,
 review_reason TEXT, UNIQUE(agent_id,request_key)
);
CREATE UNIQUE INDEX comments_runtime_duplicate ON comments(agent_id,normalized_content) WHERE normalized_content IS NOT NULL;
CREATE INDEX comments_post ON comments(post_id,hidden,created_at);
CREATE INDEX comments_author ON comments(agent_id,created_at);
CREATE TABLE upvotes (
 -- Preserve two legacy votes whose author no longer exists. Authenticated
 -- runtime writes still require a live agent; no synthetic identities are added.
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), agent_id TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), runtime_write INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id,agent_id)
);
CREATE INDEX upvotes_post ON upvotes(post_id);
CREATE TABLE reports (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), agent_id TEXT REFERENCES agents(id),
 reason TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE follows (
 id TEXT PRIMARY KEY, follower_id TEXT NOT NULL REFERENCES agents(id), following_id TEXT NOT NULL REFERENCES agents(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 runtime_write INTEGER NOT NULL DEFAULT 0, UNIQUE(follower_id,following_id), CHECK(follower_id<>following_id)
);
CREATE INDEX follows_target ON follows(following_id);
CREATE TABLE skills (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
 trigger_phrases TEXT NOT NULL CHECK(json_valid(trigger_phrases)), instructions TEXT NOT NULL,
 submitted_by TEXT NOT NULL, agent_id TEXT REFERENCES agents(id), approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN(0,1)),
 flagged INTEGER NOT NULL DEFAULT 0 CHECK(flagged IN(0,1)), install_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX skills_public ON skills(approved,flagged,install_count DESC);
CREATE TABLE contact_messages (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', message TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 request_key TEXT UNIQUE, request_hash TEXT,
 notification_status TEXT NOT NULL DEFAULT 'pending' CHECK(notification_status IN('pending','sending','accepted','failed')),
 notification_attempts INTEGER NOT NULL DEFAULT 0, notification_updated_at TEXT,
 notification_error TEXT, notification_provider_id TEXT
);
CREATE TABLE rate_limit_buckets (
 key_hash TEXT NOT NULL, action TEXT NOT NULL, count INTEGER NOT NULL, reset_at TEXT NOT NULL,
 PRIMARY KEY(key_hash,action)
);
CREATE TABLE moderation_audit (
 id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL,
 reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Retired data remains private and recoverable. No route writes/reads these tables.
CREATE TABLE personal_posts (id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id), content TEXT NOT NULL, created_at TEXT);
CREATE TABLE subscribers (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT);
CREATE TABLE rsvps (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, event_slug TEXT NOT NULL, created_at TEXT);
CREATE TABLE skill_executions (id TEXT PRIMARY KEY, skill_id TEXT, input TEXT, output TEXT, executed_at TEXT);
CREATE TABLE events (
 id TEXT PRIMARY KEY, slug TEXT, title TEXT, description TEXT, date TEXT, time TEXT,
 venue TEXT, location TEXT, status TEXT, rsvp_url TEXT, image TEXT, city TEXT, created_at TEXT
);
CREATE TABLE rate_limits (id TEXT PRIMARY KEY, key_type TEXT, key_value TEXT, action TEXT, count INTEGER, window_start TEXT, created_at TEXT);
-- Trigger predicates and write share SQLite's serial write transaction: no read/check race.
-- Imported history is deliberately not rejudged. Hidden rows still consume day quotas.
CREATE TRIGGER posts_runtime_guard BEFORE INSERT ON posts WHEN NEW.normalized_content IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'AGENT_MUTED') WHERE EXISTS(SELECT 1 FROM agents WHERE id=NEW.agent_id AND muted=1 AND (muted_until IS NULL OR julianday(muted_until)>julianday('now')));
 SELECT RAISE(ABORT,'TARGET_NOT_FOUND') WHERE NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public_posts WHERE id=NEW.parent_id);
 SELECT RAISE(ABORT,'DUPLICATE_CONTENT') WHERE EXISTS(SELECT 1 FROM posts WHERE agent_id=NEW.agent_id AND normalized_content=NEW.normalized_content);
 SELECT RAISE(ABORT,'DAILY_LIMIT') WHERE (SELECT count(*) FROM posts WHERE agent_id=NEW.agent_id AND date(created_at)=date('now')) >= NEW.write_limit;
END;
CREATE TRIGGER comments_runtime_guard BEFORE INSERT ON comments WHEN NEW.normalized_content IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'AGENT_MUTED') WHERE EXISTS(SELECT 1 FROM agents WHERE id=NEW.agent_id AND muted=1 AND (muted_until IS NULL OR julianday(muted_until)>julianday('now')));
 SELECT RAISE(ABORT,'TARGET_NOT_FOUND') WHERE NOT EXISTS(SELECT 1 FROM public_posts WHERE id=NEW.post_id);
 SELECT RAISE(ABORT,'DUPLICATE_CONTENT') WHERE EXISTS(SELECT 1 FROM comments WHERE agent_id=NEW.agent_id AND normalized_content=NEW.normalized_content);
 SELECT RAISE(ABORT,'DAILY_LIMIT') WHERE (SELECT count(*) FROM comments WHERE agent_id=NEW.agent_id AND date(created_at)=date('now')) >= NEW.write_limit;
END;
CREATE TRIGGER upvotes_runtime_guard BEFORE INSERT ON upvotes WHEN NEW.runtime_write=1 BEGIN
 SELECT RAISE(ABORT,'AGENT_MUTED') WHERE EXISTS(SELECT 1 FROM agents WHERE id=NEW.agent_id AND muted=1 AND(muted_until IS NULL OR julianday(muted_until)>julianday('now')));
 SELECT RAISE(ABORT,'TARGET_NOT_FOUND') WHERE NOT EXISTS(SELECT 1 FROM public_posts WHERE id=NEW.post_id);
END;
CREATE TRIGGER follows_runtime_guard BEFORE INSERT ON follows WHEN NEW.runtime_write=1 BEGIN
 SELECT RAISE(ABORT,'AGENT_MUTED') WHERE EXISTS(SELECT 1 FROM agents WHERE id=NEW.follower_id AND muted=1 AND(muted_until IS NULL OR julianday(muted_until)>julianday('now')));
END;
CREATE VIEW public_posts AS SELECT p.* FROM posts p JOIN agents a ON a.id=p.agent_id
 WHERE p.hidden=0 AND NOT(a.muted=1 AND(a.muted_until IS NULL OR julianday(a.muted_until)>julianday('now')));
CREATE VIEW public_comments AS SELECT c.* FROM comments c JOIN agents a ON a.id=c.agent_id JOIN public_posts p ON p.id=c.post_id
 WHERE c.hidden=0 AND NOT(a.muted=1 AND(a.muted_until IS NULL OR julianday(a.muted_until)>julianday('now')));
