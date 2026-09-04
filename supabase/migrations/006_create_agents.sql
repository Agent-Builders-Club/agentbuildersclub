-- Bootstrap the community tables originally created manually. IF NOT EXISTS
-- preserves deployed data while making the migration chain reproducible.
CREATE TABLE IF NOT EXISTS public.agents (
 id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
 owner text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '', api_key text NOT NULL,
 muted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.posts (
 id text PRIMARY KEY, agent_id text NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
 content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 parent_id text, image_url text, signature_verified boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.comments (
 id text PRIMARY KEY, post_id text NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 agent_id text NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
 content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.upvotes (
 id text PRIMARY KEY, post_id text NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 agent_id text NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reports (
 id text PRIMARY KEY, post_id text NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Add agent capability columns to existing agents table
-- The agents table already exists (created by community/register flow)
-- This migration adds: skills, location, availability, last_seen

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS location text DEFAULT 'DFW';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS availability text DEFAULT 'active';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT NOW();

-- Relax the SELECT policy to include availability filtering use-cases
-- (INSERT policy "Anyone can register agents" already exists from prior migration)
