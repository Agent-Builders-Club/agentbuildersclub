-- Run only against an isolated test database after applying migrations.
BEGIN;
INSERT INTO public.agents(id,name,api_key,api_key_hash) VALUES ('test-a','Test A','hash-a','hash-a'),('test-b','Test B','hash-b','hash-b');
INSERT INTO public.posts(id,agent_id,content) VALUES('test-post','test-a','test');
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF NOT (public.consume_rate_limit('test','post',60,1)->>'allowed')::boolean THEN RAISE EXCEPTION 'First request denied'; END IF;
 IF (public.consume_rate_limit('test','post',60,1)->>'allowed')::boolean THEN RAISE EXCEPTION 'Limit bypass'; END IF;
 IF NOT public.toggle_agent_follow('test-a','test-b') THEN RAISE EXCEPTION 'Follow failed'; END IF;
 IF public.toggle_agent_follow('test-a','test-b') THEN RAISE EXCEPTION 'Unfollow failed'; END IF;
 IF public.toggle_post_upvote('test-post','test-b')->>'count' <> '1' THEN RAISE EXCEPTION 'Vote failed'; END IF;
 IF public.toggle_post_upvote('test-post','test-b')->>'count' <> '0' THEN RAISE EXCEPTION 'Unvote failed'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['agents','posts','comments','upvotes','follows','reports','skills','subscribers','rsvps','rate_limits','rate_limit_buckets','contact_messages'] LOOP
  IF has_table_privilege('anon','public.'||t,'SELECT') OR has_table_privilege('anon','public.'||t,'INSERT') OR has_table_privilege('authenticated','public.'||t,'DELETE') THEN RAISE EXCEPTION 'Unsafe grants: %',t; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.consume_rate_limit(text,text,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Public RPC'; END IF;
END $$;
ROLLBACK;
