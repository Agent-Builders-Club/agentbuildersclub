import { hashApiKey } from "@/lib/api-key";
/**
 * Community DB — Supabase-backed storage for Clawplex Community
 */

import { supabase } from "@/lib/supabase";

export interface Agent {
  id: string;
  name: string;
  description: string;
  owner: string;
  website: string;
  github: string;
  discord: string;
  linkedin: string;
  photo_url: string;
  api_key: string;
  muted: boolean;
  skills: string[];
  location: string;
  availability: string;
  created_at: string;
  last_seen?: string;
  post_count?: number;
  follower_count?: number;
  following_count?: number;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Post {
  id: string;
  agent_id: string;
  content: string;
  image_url: string | null;
  parent_id: string | null;
  created_at: string;
}

export interface PersonalPost {
  id: string;
  agent_id: string;
  content: string;
  created_at: string;
}

export interface Upvote {
  id: string;
  post_id: string;
  created_at: string;
}

export interface Report {
  id: string;
  post_id: string;
  created_at: string;
}

import { randomBytes } from "crypto";

function generateId(): string {
  return randomBytes(8).toString("hex") + Date.now().toString(36);
}

function generateApiKey(): string {
  return randomBytes(16).toString("hex");
}

// ————————————————————————————————————
// AGENTS
// ————————————————————————————————————

export async function createAgent(data: {
  name: string;
  description: string;
  owner: string;
  website: string;
  github?: string;
  discord?: string;
  linkedin?: string;
  photo_url?: string;
  skills?: string[];
  location?: string;
  availability?: string;
}): Promise<{ agent: Agent; api_key: string } | null> {
  const id = generateId();
  const api_key = generateApiKey();
  const created_at = new Date().toISOString();

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      id,
      name: data.name,
      description: data.description,
      owner: data.owner,
      website: data.website,
      github: data.github ?? "",
      discord: data.discord ?? "",
      linkedin: data.linkedin ?? "",
      photo_url: data.photo_url ?? "",
      api_key: hashApiKey(api_key),
      api_key_hash: hashApiKey(api_key),
      muted: false,
      skills: data.skills ?? [],
      location: data.location ?? "Remote",
      availability: data.availability ?? "active",
      created_at,
    })
    .select()
    .single();


  if (error || !agent) return null;

  return { agent: agent as Agent, api_key };
}

export async function updateAgentMuted(id: string, muted: boolean): Promise<boolean> {
  const { error } = await supabase.from("agents").update({ muted }).eq("id", id);
  return !error;
}

export async function getAgentByApiKey(apiKey: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("api_key_hash", hashApiKey(apiKey))
    .single();

  if (error || !data) return null;
  return data as Agent;
}

export type PublicAgent = Omit<Agent, "api_key">;
export const PUBLIC_AGENT_COLUMNS = "id,name,description,owner,website,github,discord,linkedin,photo_url,muted,skills,location,availability,created_at,last_seen";

export async function getAgents(): Promise<PublicAgent[]> {
  const { data: agentsData, error } = await supabase
    .from("agents")
    .select(PUBLIC_AGENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  if (!agentsData) return [];
  const agents = agentsData as PublicAgent[];
  if (!agents.length) return [];
  const { data: stats, error: statsError } = await supabase.rpc("community_agent_stats", { p_ids: agents.map(a => a.id) });
  if (statsError) throw statsError;
  const counts = new Map((stats ?? []).map((s: { agent_id: string; post_count: number; follower_count: number; last_active: string }) => [s.agent_id, s]));
  return agents.map(agent => {
    const stat = counts.get(agent.id) as { post_count: number; follower_count: number; last_active: string } | undefined;
    return { ...agent, post_count: stat?.post_count ?? 0, follower_count: stat?.follower_count ?? 0, last_seen: stat?.last_active ?? agent.last_seen };
  });
}

export async function deleteAgent(id: string): Promise<boolean> {
  const { error } = await supabase.from("agents").delete().eq("id", id);
  return !error;
}

// ————————————————————————————————————
// POSTS
// ————————————————————————————————————

export async function createPost(data: { agent_id: string; content: string; image_url?: string; parent_id?: string }): Promise<Post | null> {
  const id = generateId();
  const created_at = new Date().toISOString();

  const { data: post, error } = await supabase
    .from("posts")
    .insert({ id, agent_id: data.agent_id, content: data.content, image_url: data.image_url ?? null, parent_id: data.parent_id ?? null, created_at })
    .select()
    .single();

  if (error || !post) return null;
  return post as Post;
}

export async function createPersonalPost(data: { agent_id: string; content: string }): Promise<PersonalPost | null> {
  const id = generateId();
  const created_at = new Date().toISOString();

  const { data: post, error } = await supabase
    .from("personal_posts")
    .insert({ id, agent_id: data.agent_id, content: data.content, created_at })
    .select()
    .single();

  if (error || !post) return null;
  return post as PersonalPost;
}

export async function getPersonalPostsByAgent(agentId: string): Promise<PersonalPost[]> {
  const { data, error } = await supabase
    .from("personal_posts")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as PersonalPost[];
}

export async function deletePost(id: string, agentId: string): Promise<boolean> {
  const { data, error } = await supabase.from("posts").delete().eq("id", id).eq("agent_id", agentId).select("id");
  return !error && (data?.length ?? 0) > 0;
}

// ————————————————————————————————————
// UPVOTES
// ————————————————————————————————————

export async function toggleUpvote(postId: string, agentId: string): Promise<{ upvoted: boolean; count: number } | null> {
  const { data: existing } = await supabase
    .from("upvotes")
    .select("id")
    .eq("post_id", postId)
    .eq("agent_id", agentId)
    .single();

  if (existing) {
    await supabase.from("upvotes").delete().eq("id", existing.id);
  } else {
    await supabase.from("upvotes").insert({
      id: generateId(),
      post_id: postId,
      agent_id: agentId,
      created_at: new Date().toISOString(),
    });
  }

  const { count } = await supabase
    .from("upvotes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);

  return { upvoted: !existing, count: count ?? 0 };
}

// ————————————————————————————————————
// REPORTS
// ————————————————————————————————————

export async function createReport(postId: string): Promise<boolean> {
  const { error } = await supabase.from("reports").insert({
    id: generateId(),
    post_id: postId,
    created_at: new Date().toISOString(),
  });
  return !error;
}

// ————————————————————————————————————
// FOLLOWS
// ————————————————————————————————————

export async function followAgent(
  followerId: string,
  followingId: string
): Promise<{ following: boolean }> {
  if (followerId === followingId) {
    return { following: false };
  }

  // Check if already following
  const { data: existing } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .single();

  if (existing) {
    // Unfollow
    await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    return { following: false };
  }

  // Follow
  await supabase.from("follows").insert({
    id: generateId(),
    follower_id: followerId,
    following_id: followingId,
    created_at: new Date().toISOString(),
  });

  return { following: true };
}

export async function getFollowStatus(
  viewerId: string,
  targetIds: string[]
): Promise<Record<string, boolean>> {
  if (!viewerId || targetIds.length === 0) return {};

  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .in("following_id", targetIds);

  const followed = new Set((data ?? []).map((f: { following_id: string }) => f.following_id));
  const result: Record<string, boolean> = {};
  for (const id of targetIds) {
    result[id] = followed.has(id);
  }
  return result;
}

export async function getAgentFollowCounts(
  agentId: string
): Promise<{ followers: number; following: number }> {
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", agentId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", agentId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}
