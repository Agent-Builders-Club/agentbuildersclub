-- Forward-only, data-preserving policy change. 0001 and every historical cell stay intact.
-- Nonunique lookup: a time-dependent uniqueness constraint requires an INSERT trigger.
DROP INDEX comments_runtime_duplicate;
CREATE INDEX comments_runtime_duplicate ON comments(agent_id,post_id,normalized_content,created_at);
DROP TRIGGER comments_runtime_guard;
CREATE TRIGGER comments_runtime_guard BEFORE INSERT ON comments WHEN NEW.normalized_content IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'AGENT_MUTED') WHERE EXISTS(SELECT 1 FROM agents WHERE id=NEW.agent_id AND muted=1 AND (muted_until IS NULL OR julianday(muted_until)>julianday('now')));
 SELECT RAISE(ABORT,'TARGET_NOT_FOUND') WHERE NOT EXISTS(SELECT 1 FROM public_posts WHERE id=NEW.post_id);
 SELECT RAISE(ABORT,'DUPLICATE_CONTENT') WHERE EXISTS(SELECT 1 FROM comments WHERE agent_id=NEW.agent_id AND post_id=NEW.post_id AND normalized_content=NEW.normalized_content AND julianday(created_at)>julianday(NEW.created_at,'-24 hours'));
 SELECT RAISE(ABORT,'DAILY_LIMIT') WHERE (SELECT count(*) FROM comments WHERE agent_id=NEW.agent_id AND date(created_at)=date('now')) >= NEW.write_limit;
END;
-- NULL keeps legacy/explicit/old-Worker inserts compatible; no backfill or table rebuild.
ALTER TABLE contact_messages ADD COLUMN implicit_fingerprint TEXT;
CREATE INDEX contact_implicit_window ON contact_messages(implicit_fingerprint,created_at);
CREATE TRIGGER contact_implicit_guard BEFORE INSERT ON contact_messages WHEN NEW.implicit_fingerprint IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'DUPLICATE_INQUIRY') WHERE EXISTS(SELECT 1 FROM contact_messages WHERE (implicit_fingerprint=NEW.implicit_fingerprint OR (implicit_fingerprint IS NULL AND request_key=NEW.implicit_fingerprint)) AND julianday(created_at)>julianday(NEW.created_at,'-30 minutes'));
END;
