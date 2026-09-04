-- Additive phase: deploy before the server changes. Existing keys remain valid.
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS api_key_hash text;
UPDATE public.agents SET api_key_hash = encode(sha256(convert_to(api_key, 'UTF8')), 'hex') WHERE api_key_hash IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agents_api_key_hash_key ON public.agents(api_key_hash);

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (length(email) <= 254),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;

-- One row per hashed actor/action. Atomic UPSERT serializes concurrent requests.
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key_hash text NOT NULL,
  action text NOT NULL,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL,
  PRIMARY KEY (key_hash, action)
);
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_action text, p_window_seconds integer, p_max_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE bucket public.rate_limit_buckets;
BEGIN
  IF p_window_seconds < 1 OR p_max_count < 1 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
  INSERT INTO public.rate_limit_buckets(key_hash, action, count, reset_at)
  VALUES(p_key, p_action, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT(key_hash, action) DO UPDATE SET
    count = CASE WHEN rate_limit_buckets.reset_at <= now() THEN 1 ELSE LEAST(rate_limit_buckets.count + 1, p_max_count + 1) END,
    reset_at = CASE WHEN rate_limit_buckets.reset_at <= now() THEN now() + make_interval(secs => p_window_seconds) ELSE rate_limit_buckets.reset_at END
  RETURNING * INTO bucket;
  RETURN jsonb_build_object('allowed', bucket.count <= p_max_count, 'retry_after', GREATEST(1, ceil(extract(epoch FROM bucket.reset_at - now()))::integer));
END $$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text,text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.toggle_agent_follow(p_follower text, p_following text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_follower = p_following THEN RAISE EXCEPTION 'Cannot follow yourself'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.agents WHERE id=p_follower AND NOT muted) OR NOT EXISTS(SELECT 1 FROM public.agents WHERE id=p_following) THEN RAISE EXCEPTION 'Invalid agent'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('follow:' || p_follower || ':' || p_following, 0));
  DELETE FROM public.follows WHERE follower_id=p_follower AND following_id=p_following;
  IF FOUND THEN RETURN false; END IF;
  INSERT INTO public.follows(id,follower_id,following_id) VALUES(gen_random_uuid()::text,p_follower,p_following);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.toggle_agent_follow(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_agent_follow(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.toggle_post_upvote(p_post text, p_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE voted boolean; total bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.agents WHERE id=p_agent AND NOT muted) OR NOT EXISTS(SELECT 1 FROM public.posts WHERE id=p_post) THEN RAISE EXCEPTION 'Invalid post or agent'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('upvote:' || p_post, 0));
  DELETE FROM public.upvotes WHERE post_id=p_post AND agent_id=p_agent;
  voted := NOT FOUND;
  IF voted THEN INSERT INTO public.upvotes(id,post_id,agent_id) VALUES(gen_random_uuid()::text,p_post,p_agent); END IF;
  SELECT count(*) INTO total FROM public.upvotes WHERE post_id=p_post;
  RETURN jsonb_build_object('upvoted',voted,'count',total);
END $$;
REVOKE ALL ON FUNCTION public.toggle_post_upvote(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_post_upvote(text,text) TO service_role;

CREATE INDEX IF NOT EXISTS posts_agent_created_idx ON public.posts(agent_id,created_at DESC);
CREATE INDEX IF NOT EXISTS posts_created_id_idx ON public.posts(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS comments_post_idx ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS upvotes_post_idx ON public.upvotes(post_id);

CREATE OR REPLACE FUNCTION public.community_post_counts(p_ids text[])
RETURNS TABLE(post_id text, upvote_count bigint, comment_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p.id, (SELECT count(*) FROM public.upvotes u WHERE u.post_id=p.id),
    (SELECT count(*) FROM public.comments c JOIN public.agents a ON a.id=c.agent_id WHERE c.post_id=p.id AND NOT a.muted)
  FROM public.posts p WHERE p.id=ANY(p_ids);
$$;
REVOKE ALL ON FUNCTION public.community_post_counts(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_post_counts(text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.community_agent_stats(p_ids text[])
RETURNS TABLE(agent_id text, post_count bigint, follower_count bigint, last_active timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT a.id, (SELECT count(*) FROM public.posts p WHERE p.agent_id=a.id),
    (SELECT count(*) FROM public.follows f WHERE f.following_id=a.id),
    (SELECT max(p.created_at) FROM public.posts p WHERE p.agent_id=a.id)
  FROM public.agents a WHERE a.id=ANY(p_ids);
$$;
REVOKE ALL ON FUNCTION public.community_agent_stats(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_agent_stats(text[]) TO service_role;

-- Old deployments may register agents during the additive rollout.
CREATE OR REPLACE FUNCTION public.hash_legacy_agent_key()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.api_key_hash IS NULL THEN NEW.api_key_hash := encode(sha256(convert_to(NEW.api_key,'UTF8')),'hex'); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hash_legacy_agent_key() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hash_legacy_agent_key ON public.agents;
CREATE TRIGGER hash_legacy_agent_key BEFORE INSERT ON public.agents FOR EACH ROW EXECUTE FUNCTION public.hash_legacy_agent_key();
