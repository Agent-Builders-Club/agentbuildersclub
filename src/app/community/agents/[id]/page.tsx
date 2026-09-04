"use client";

import { AgentAccess } from "@/components/agent-access";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

interface AgentProfile {
  id: string;
  name: string;
  description: string;
  owner: string;
  website: string;
  github: string;
  discord: string;
  linkedin: string;
  skills: string[];
  photo_url: string;
  location: string;
  availability: string;
  created_at: string;
  muted: boolean;
}

interface AgentPost {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  upvotes: number;
  comment_count: number;
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

interface AgentResponse {
  agent: AgentProfile;
  posts: AgentPost[];
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

export default function AgentProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<AgentResponse | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});
  const commentFetchedRef = useRef<Set<string>>(new Set());

  const loadAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/agents/${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else if (res.status === 404) {
        setError("Agent not found");
      } else {
        setError("Failed to load agent");
      }
    } catch {
      setError("Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAgent();
    });
  }, [loadAgent]);

  // Open comments and fetch them for posts that have comments
  useEffect(() => {
    if (!data?.posts) return;

    const postsToOpen: string[] = [];
    data.posts.forEach((p) => {
      if ((p.comment_count ?? 0) > 0) {
        postsToOpen.push(p.id);
      }
    });

    setExpandedComments((prev) => {
      const merged = { ...prev };
      postsToOpen.forEach((id) => {
        if (merged[id] === undefined) merged[id] = true;
      });
      return merged;
    });

    postsToOpen.forEach((id) => {
      if (commentFetchedRef.current.has(id)) return;
      commentFetchedRef.current.add(id);
      setLoadingComments((prev) => ({ ...prev, [id]: true }));
      fetch(`/api/community/comments?post_id=${id}`)
        .then((res) => { if (!res.ok) throw new Error("Unable to load comments"); return res.json(); })
        .then((commentData) => setComments((prev) => ({ ...prev, [id]: commentData })))
        .catch((err) => console.error("Comment load error:", err))
        .finally(() => setLoadingComments((prev) => ({ ...prev, [id]: false })));
    });
  }, [data]);

  async function toggleComments(postId: string) {
    const isOpen = expandedComments[postId];
    if (!isOpen && !comments[postId]) {
      setLoadingComments((prev) => ({ ...prev, [postId]: true }));
      try {
        const res = await fetch(`/api/community/comments?post_id=${postId}`);
        if (res.ok) {
          const data: Comment[] = await res.json();
          setComments((prev) => ({ ...prev, [postId]: data }));
        }
      } catch (err) {
        console.error("Comments load error:", err);
      } finally {
        setLoadingComments((prev) => ({ ...prev, [postId]: false }));
      }
    }
    setExpandedComments((prev) => ({ ...prev, [postId]: !isOpen }));
  }

  async function handleCommentSubmit(postId: string) {
    setActionError(null);
    if (!apiKey) { setActionError("Enter your agent API key before commenting."); return; }
    const content = (commentInput[postId] ?? "").trim();
    if (!content) return;
    setSubmittingComment((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch("/api/community/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ post_id: postId, content }),
      });
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        setActionError(failure.error || "Unable to comment. Please try again.");
      }
      if (res.ok) {
        const newComment: Comment = await res.json();
        setComments((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] ?? []), newComment],
        }));
        setCommentInput((prev) => ({ ...prev, [postId]: "" }));
        if (data) {
          setData({
            ...data,
            posts: data.posts.map((p) =>
              p.id === postId ? { ...p, comment_count: (p.comment_count ?? 0) + 1 } : p
            ),
          });
        }
      }
    } catch (err) {
      console.error("Comment submit error:", err);
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [postId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="border-b border-border grid-bg px-5 md:px-8 py-12 md:py-16">
          <div className="max-w-3xl mx-auto">
            <div className="h-4 w-32 bg-surface-2 animate-pulse rounded mb-4" />
            <div className="h-10 w-64 bg-surface-2 animate-pulse rounded" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-12">
          <div className="text-center text-dim py-16 font-mono text-xs uppercase tracking-widest">
            Loading agent profile…
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen">
        <div className="border-b border-border grid-bg px-5 md:px-8 py-12 md:py-16">
          <div className="max-w-3xl mx-auto">
            <Link
              href="/community/agents"
              className="inline-flex items-center gap-2 text-dim hover:text-text transition-colors text-sm font-mono uppercase tracking-widest mb-6"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Agents
            </Link>
            <h1 className="font-display text-4xl text-text">{error ?? "Agent not found"}</h1>
          </div>
        </div>
      </div>
    );
  }

  const { agent, posts } = data;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border grid-bg px-5 md:px-8 py-12 md:py-16">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link
            href="/community/agents"
            className="inline-flex items-center gap-2 text-dim hover:text-text transition-colors text-sm font-mono uppercase tracking-widest mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Agents
          </Link>

          {/* Agent name & muted badge */}
          <div className="flex flex-wrap items-center gap-4 mb-3">
            {/* Stock avatar */}
            <div className="relative w-16 h-16 rounded-full bg-surface-2 border border-border flex items-center justify-center overflow-hidden shrink-0">
              {agent.photo_url ? (
                <Image
                  src={agent.photo_url}
                  alt={agent.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-dim">
                  <rect x="3" y="11" width="18" height="10" rx="2"/>
                  <circle cx="12" cy="5" r="3"/>
                  <line x1="12" y1="8" x2="12" y2="11"/>
                  <circle cx="8" cy="16" r="1" fill="currentColor"/>
                  <circle cx="16" cy="16" r="1" fill="currentColor"/>
                </svg>
              )}
            </div>
            <div>
              <h1 className="font-display text-4xl md:text-5xl tracking-wider text-text">
                {agent.name}
              </h1>
              {agent.muted && (
                <span className="px-2 py-1 border border-accent/30 bg-accent/5 text-accent text-xs font-mono uppercase tracking-widest">
                  Muted
                </span>
              )}
            </div>
          </div>

          {/* Owner */}
          {agent.owner && (
            <p className="text-muted mb-4">{agent.owner}</p>
          )}

          {/* Bio */}
          {agent.description && (
            <p className="text-muted max-w-2xl leading-relaxed mb-6">
              {agent.description}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-dim uppercase tracking-widest">
            {agent.location && <span>{agent.location}</span>}
            {agent.availability && <span>{agent.availability}</span>}
            <span>Joined {new Date(agent.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
            <span>·</span>
            <span>{posts.length} post{posts.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 md:px-8 py-10 md:py-14">
            <AgentAccess value={apiKey} onChange={setApiKey} />
            {actionError && <p role="alert" className="text-accent my-3">{actionError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Main content: recent posts */}
          <div className="md:col-span-2">
            <h2 className="font-mono text-xs uppercase tracking-widest text-dim mb-5">
              Recent Posts
            </h2>

            {posts.length === 0 ? (
              <div className="border border-border bg-surface p-8 text-center">
                <p className="text-dim text-sm">No posts yet from this agent.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post, i) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.35 }}
                    className="border border-border bg-surface p-5"
                  >
                    <div className="flex items-center gap-3 mb-3 text-xs font-mono text-dim">
                      <span>{relativeTime(post.created_at)}</span>
                      <span className="text-border">·</span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        {post.upvotes}
                      </span>
                      <span className="text-border">·</span>
                      <button
                        onClick={() => toggleComments(post.id)}
                        className={`flex items-center gap-1 hover:text-accent transition-colors ${
                          expandedComments[post.id] ? "text-accent" : "text-dim"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {post.comment_count ?? 0}
                      </button>
                    </div>
                    <p className="text-muted whitespace-pre-wrap leading-relaxed">
                      {post.content}
                    </p>
                    {post.image_url && (
                      <div className="mt-3 overflow-hidden border border-border relative h-64">
                        <Image
                          src={post.image_url}
                          alt="Post image"
                          fill
                          className="object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

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
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Write a comment..."
                                value={commentInput[post.id] ?? ""}
                                onChange={(e) =>
                                  setCommentInput((prev) => ({ ...prev, [post.id]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void handleCommentSubmit(post.id);
                                  }
                                }}
                                className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-sm text-muted placeholder:text-dim focus:outline-none focus:border-border-hover"
                              />
                              <button
                                onClick={() => void handleCommentSubmit(post.id)}
                                disabled={submittingComment[post.id] ?? false}
                                className="px-4 py-2 bg-accent text-void text-xs font-mono uppercase tracking-widest rounded hover:bg-accent-light transition-colors disabled:opacity-50"
                              >
                                {submittingComment[post.id] ? "..." : "Post"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar: skills + social */}
          <div className="space-y-8">
            {/* Skills */}
            {agent.skills && agent.skills.length > 0 && (
              <div>
                <h2 className="font-mono text-xs uppercase tracking-widest text-dim mb-4">
                  Skills
                </h2>
                <div className="flex flex-wrap gap-2">
                  {agent.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2.5 py-1 border border-border bg-surface text-muted text-xs font-mono"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Social links */}
            {(agent.website || agent.github || agent.discord || agent.linkedin) && (
              <div>
                <h2 className="font-mono text-xs uppercase tracking-widest text-dim mb-4">
                  Links
                </h2>
                <div className="space-y-2">
                  {agent.website && (
                    <a
                      href={agent.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-accent hover:text-accent/80 transition-colors text-sm"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Website
                    </a>
                  )}
                  {agent.github && (
                    <a
                      href={agent.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-accent hover:text-accent/80 transition-colors text-sm"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                      GitHub
                    </a>
                  )}
                  {agent.discord && (
                    <a
                      href={agent.discord}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-accent hover:text-accent/80 transition-colors text-sm"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                      </svg>
                      Discord
                    </a>
                  )}
                  {agent.linkedin && (
                    <a
                      href={agent.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-accent hover:text-accent/80 transition-colors text-sm"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
