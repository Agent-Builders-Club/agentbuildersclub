"use client";

import { useState, useEffect, useCallback } from "react";
import { Nav } from "@/components/nav";
import { SkillCard } from "@/components/skill-card";
import type { Skill, SkillCategory } from "@/components/skill-card";

const CATEGORIES: SkillCategory[] = ["Research", "Productivity", "Social", "Utility", "Creative"];

export function SkillsClient() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<SkillCategory | "All">("All");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: Skill[] = await res.json();
      setSkills(data);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchSkills();
    });
  }, [fetchSkills]);

  const filtered = skills.filter((s) => {
    const matchCat = activeCategory === "All" || s.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
  const displayed = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="pt-16">
        {/* Hero */}
        <section className="border-b border-border px-5 md:px-8 pt-20 pb-14">
          <div className="mx-auto max-w-5xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent mb-3">
              Agent Builders Club Marketplace
            </p>
            <h1 className="font-display text-4xl md:text-6xl lg:text-7xl tracking-wider text-text mb-4">
              AGENT SKILLS.
            </h1>
            <p className="text-base text-muted max-w-xl">
              Community-built agents, ready to install.
            </p>
          </div>
        </section>

        {/* CTAs */}
        <section className="border-b border-border px-5 md:px-8 py-6">
          <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
            <a
              href="https://github.com/Agent-Builders-Club/agentbuildersclub/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-accent text-void font-mono text-xs uppercase tracking-widest px-5 py-3 hover:opacity-90 transition-opacity"
            >
              + Submit a Skill
            </a>
            <a
              href="/community"
              className="inline-flex items-center gap-2 border border-accent text-accent font-mono text-xs uppercase tracking-widest px-5 py-3 hover:bg-accent hover:text-void transition-colors"
            >
              View Feed
            </a>
          </div>
        </section>

        {/* Filters */}
        <section className="border-b border-border px-5 md:px-8 py-5">
          <div className="mx-auto max-w-5xl flex flex-wrap items-center gap-4">
            <input
              type="search"
              placeholder="Search skills..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisibleCount(6); }}
              className="bg-surface border border-border text-text font-mono text-xs uppercase tracking-widest px-4 py-2 placeholder-dim focus:outline-none focus:border-accent w-52"
            />
            <div className="flex flex-wrap gap-2">
              {(["All", ...CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setVisibleCount(6); }}
                  className={`font-mono text-xs uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                    activeCategory === cat
                      ? "bg-accent text-void border-accent"
                      : "border-border text-dim hover:border-accent hover:text-accent"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Grid */}
        <section className="px-5 md:px-8 py-10 md:py-16">
          <div className="mx-auto max-w-5xl">
            {loading ? (
              <p className="text-center py-24 font-mono text-xs uppercase tracking-widest text-dim">
                Loading...
              </p>
            ) : displayed.length === 0 ? (
              <p className="text-center py-24 font-mono text-xs uppercase tracking-widest text-dim">
                No skills found
              </p>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {displayed.map((skill, i) => (
                    <SkillCard key={skill.id} skill={skill} index={i} />
                  ))}
                </div>
                {hasMore && (
                  <div className="text-center mt-10">
                    <button
                      onClick={() => setVisibleCount((c) => c + 6)}
                      className="border border-border text-dim font-mono text-xs uppercase tracking-widest px-8 py-3 hover:border-accent hover:text-accent transition-colors"
                    >
                      Load More
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
