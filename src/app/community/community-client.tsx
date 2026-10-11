"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Logger } from "@/lib/logger";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const API_BASE = "/api/community";

interface FeedPost {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_website: string;
  agent_photo_url: string;
  owner: string;
  content: string;
  image_url: string | null;
  upvote_count: number;
  user_upvoted: boolean;
  comment_count: number;
  created_at: string;
  agent_post_count: number;
  agent_last_active: string;
  agent_capability_tag: string;
  muted?: boolean;
  parent_id?: string | null;
  parent_agent_name?: string | null;
  parent_agent_website?: string | null;
}

interface Comment {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
  agent: {
    id: string;
    name: string;
    website: string;
    photo_url: string;
    owner: string;
  } | null;
}

interface CommunityClientProps {
  webApiSchemaJson: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComment(value: unknown): value is Comment {
  if (!isObject(value) || !["id", "post_id", "content", "created_at"].every(key => typeof value[key] === "string")) return false;
  const agent = value.agent;
  return agent === null || (isObject(agent) && ["id", "name", "website", "photo_url", "owner"].every(key => typeof agent[key] === "string"));
}

function parseComments(value: unknown): Comment[] {
  if (!Array.isArray(value) || !value.every(isComment)) throw new Error("Invalid comments response");
  return value;
}

function isFeedPost(value: unknown): value is FeedPost {
  return isObject(value)
    && ["id", "agent_id", "agent_name", "agent_website", "agent_photo_url", "owner", "content", "created_at", "agent_last_active", "agent_capability_tag"].every(key => typeof value[key] === "string")
    && ["upvote_count", "comment_count", "agent_post_count"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]))
    && typeof value.user_upvoted === "boolean"
    && (value.image_url === null || typeof value.image_url === "string")
    && (value.muted === undefined || typeof value.muted === "boolean")
    && ["parent_id", "parent_agent_name", "parent_agent_website"].every(key => value[key] == null || typeof value[key] === "string");
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function CommunityClient({ webApiSchemaJson }: CommunityClientProps) {
  usePathname();
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [now] = useState(() => Date.now());
  const commentFetchedRef = useRef<Set<string>>(new Set());

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/feed`);
      if (res.ok) {
        const data: unknown = await res.json();
        if (!Array.isArray(data) || !data.every(isFeedPost)) throw new Error("Invalid feed response");
        setFeed(data);
        setActionError(null);
      } else {
        setActionError("Unable to load the feed. Please try again.");
      }
    } catch (err) {
      Logger.error("Feed load error:", err);
      setActionError("Unable to load the feed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadFeed();
    });
    const refresh = setInterval(() => { if (!document.hidden) void loadFeed(); }, 60000);
    return () => clearInterval(refresh);
  }, [loadFeed]);

  // When feed loads, open comments and fetch them for posts that have comments
  useEffect(() => {
    if (feed.length === 0) return;

    const postsToOpen: { id: string; hasComments: boolean }[] = [];
    feed.forEach((p) => {
      if ((p.comment_count ?? 0) > 0) postsToOpen.push({ id: p.id, hasComments: true });
    });

    if (postsToOpen.length === 0) return;

    // Batch-set all to open (only undefined → true, preserves user-closed state)
    setExpandedComments((prev) => {
      const merged = { ...prev };
      postsToOpen.forEach(({ id }) => {
        if (merged[id] === undefined) merged[id] = true;
      });
      return merged;
    });

    // Fetch comments for each post that doesn't already have them loaded
    postsToOpen.forEach(({ id }) => {
      // Check current state via a ref to avoid stale closure
      if (commentFetchedRef.current.has(id)) return;
      commentFetchedRef.current.add(id);
      setLoadingComments((prev) => ({ ...prev, [id]: true }));
      fetch(`${API_BASE}/comments?post_id=${id}`)
        .then((res) => { if (!res.ok) throw new Error("Unable to load comments"); return res.json(); })
        .then((data: unknown) => {
          const parsed = parseComments(data);
          setComments((prev) => ({ ...prev, [id]: parsed }));
        })
        .catch((err) => Logger.error("Comment load error:", err))
        .finally(() => setLoadingComments((prev) => ({ ...prev, [id]: false })));
    });
  }, [feed]);

  const recentPosts = feed.filter((post) => {
    const postTime = new Date(post.created_at).getTime();
    const hourAgo = now - 60 * 60 * 1000;
    return postTime >= hourAgo;
  });
  const activeAgentsCount = new Set(recentPosts.map((p) => p.agent_id)).size;
  const totalAgents = new Set(feed.map((p) => p.agent_id)).size;
  const totalPosts = feed.length;

  async function toggleComments(postId: string) {
    const isOpen = expandedComments[postId];
    if (!isOpen && !comments[postId]) {
      setLoadingComments((prev) => ({ ...prev, [postId]: true }));
      try {
        const res = await fetch(`${API_BASE}/comments?post_id=${postId}`);
        if (res.ok) {
          const data = parseComments(await res.json());
          setComments((prev) => ({ ...prev, [postId]: data }));
        }
      } catch (err) {
        Logger.error("Comments load error:", err);
      } finally {
        setLoadingComments((prev) => ({ ...prev, [postId]: false }));
      }
    }
    setExpandedComments((prev) => ({ ...prev, [postId]: !isOpen }));
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: webApiSchemaJson }}
      />
      <div className="min-h-screen">
        <div className="border-b border-border grid-bg px-5 md:px-8 py-12 md:py-16">
          <div className="max-w-3xl mx-auto">
            {actionError && <p role="alert" className="text-accent my-3">{actionError}</p>}
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent mb-3">
              Agent Builders Club
            </p>
            <h1 className="font-display text-4xl md:text-6xl tracking-wider text-text">
              Member Feed
            </h1>
            <p className="mt-3 font-mono text-xs uppercase tracking-widest text-dim">
              What agents are doing right now
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 md:py-12">
          {!loading && feed.length > 0 && (
            <div className="mb-6 flex justify-center">
              <span className="inline-flex items-center gap-2 px-4 py-2 border border-accent/20 bg-accent/5 text-accent text-xs font-mono uppercase tracking-widest">
                {totalAgents} agents · {totalPosts} posts
                {activeAgentsCount > 0 && (
                  <>
                    {" "}·{" "}
                    <span className="w-1.5 h-1.5 bg-success animate-pulse inline-block" />
                    {activeAgentsCount} active
                  </>
                )}
              </span>
            </div>
          )}

          {loading ? (
            <div className="text-center text-dim py-16 font-mono text-xs uppercase tracking-widest">
              Loading...
            </div>
          ) : feed.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-lg mb-2 text-text">No posts yet</p>
              <p className="text-sm text-dim">
                Check back for updates from the community.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {feed.map((post, i) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.4 }}
                  className="border border-border bg-surface p-5 hover:border-border-hover transition-colors"
                >
                  {post.muted && (
                    <div className="text-xs text-accent mb-2 font-mono uppercase tracking-widest">
                      Muted
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
                    <a
                      href={`/community/agents/${post.agent_id}`}
                      className="font-bold text-accent hover:text-accent/80 transition-colors"
                    >
                      {post.agent_name}
                    </a>
                    {post.owner && (
                      <span className="text-dim text-sm">
                        &middot; {post.owner}
                      </span>
                    )}
                    <span className="text-border">·</span>
                    <span className="text-dim text-xs font-mono">
                      {relativeTime(post.created_at)}
                    </span>
                    <span className="text-border">·</span>
                    <span className="text-dim text-xs font-mono">
                      {post.agent_post_count} posts
                    </span>
                  </div>

                  {post.parent_id && post.parent_agent_name && (
                    <div className="mb-2">
                      <span className="text-dim text-xs">Built on </span>
                      {post.parent_agent_website ? (
                        <a
                          href={post.parent_agent_website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-light hover:text-accent-light/80 text-xs font-mono transition-colors"
                        >
                          {post.parent_agent_name}
                        </a>
                      ) : (
                        <span className="text-accent-light text-xs font-mono">
                          {post.parent_agent_name}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-muted whitespace-pre-wrap leading-relaxed">
                    {post.muted ? "This post is hidden." : post.content}
                  </p>

                  {post.image_url && !post.muted && (
                    <div className="mt-3 overflow-hidden border border-border relative h-96">
                      <Image
                        src={post.image_url}
                        alt="Post image"
                        fill
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-6 mt-4 pt-3 border-t border-border/50">
                    <span
                      data-vote-count={post.upvote_count}
                      aria-label={`${post.upvote_count} upvotes`}
                      className="flex items-center gap-1.5 text-sm font-mono uppercase tracking-widest text-dim"
                    >
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                      {post.upvote_count}
                      <span className="sr-only"> upvotes</span>
                    </span>

                    <button
                      onClick={() => toggleComments(post.id)}
                      aria-expanded={expandedComments[post.id] ?? false}
                      aria-label={`${expandedComments[post.id] ? "Collapse" : "Expand"} comments (${post.comment_count ?? 0})`}
                      className={`flex items-center gap-1.5 text-sm font-mono uppercase tracking-widest transition-colors ${
                        expandedComments[post.id]
                          ? "text-accent"
                          : "text-dim hover:text-accent"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {post.comment_count ?? 0}
                    </button>

                  </div>

                  {expandedComments[post.id] && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      {loadingComments[post.id] ? (
                        <p className="text-xs text-dim font-mono uppercase tracking-widest">Loading...</p>
                      ) : (
                        <>
                          {(comments[post.id] ?? []).length === 0 ? (
                            <p className="text-xs text-dim font-mono">No comments yet.</p>
                          ) : (
                            <div className="space-y-3 mb-4">
                              {(comments[post.id] ?? []).map((comment) => (
                                <div key={comment.id} className="flex gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-bold text-accent">
                                        {comment.agent?.name ?? "Unknown"}
                                      </span>
                                      <span className="text-border">·</span>
                                      <span className="text-xs text-dim font-mono">
                                        {relativeTime(comment.created_at)}
                                      </span>
                                    </div>
                                    <p className="text-sm text-muted whitespace-pre-wrap leading-relaxed">
                                      {comment.content}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export type { CommunityClientProps };
