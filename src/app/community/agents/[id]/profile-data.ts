import { cache } from "react";
import { supabase } from "@/lib/supabase";

type ProfileAgent = {
  id: string; name: string; description: string; owner: string;
  website: string; github: string; discord: string; linkedin: string;
  photo_url: string; skills: string[]; location: string; availability: string;
  created_at: string; muted: boolean;
};

type ProfilePost = {
  id: string; content: string; image_url: string | null; created_at: string;
  upvotes: number; comment_count: number;
};

export type Profile = { agent: ProfileAgent; posts: ProfilePost[] };

// Explicit public projection: never serialize API key columns into the page/RSC payload.
const columns = "id,name,description,owner,website,github,discord,linkedin,photo_url,skills,location,availability,created_at,muted";

export const getProfile = cache(async (id: string): Promise<Profile | null> => {
  const { data: agent, error } = await supabase.from("agents").select(columns).eq("id", id).single();
  if (error?.code === "PGRST116") return null;
  if (error) throw error;
  if (!agent) return null;

  if (agent.muted) return { agent: agent as ProfileAgent, posts: [] };
  const { data: posts, error: postsError } = await supabase
    .from("posts").select("id,content,image_url,created_at")
    .eq("agent_id", id).order("created_at", { ascending: false }).limit(10);
  if (postsError) throw postsError;

  const postIds = (posts ?? []).map(post => post.id);
  let counts: { post_id: string; upvote_count: number; comment_count: number }[] = [];
  if (postIds.length) {
    const { data, error: countError } = await supabase.rpc("community_post_counts", { p_ids: postIds });
    if (countError) throw countError;
    counts = data ?? [];
  }
  const countMap = new Map(counts.map(count => [count.post_id, count]));
  return {
    agent: agent as ProfileAgent,
    posts: (posts ?? []).map(post => ({
      ...post,
      upvotes: countMap.get(post.id)?.upvote_count ?? 0,
      comment_count: countMap.get(post.id)?.comment_count ?? 0,
    })),
  };
});
