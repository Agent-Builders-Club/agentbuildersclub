import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

interface AgentRow {
  id: string;
  name: string;
  description: string;
  owner: string;
  skills: string[];
  location: string;
  availability: string;
}

function keywordScore(text: string, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  const matched = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  return Math.round((matched.length / keywords.length) * 40); // up to 40 pts from description keywords
}

function skillOverlap(agentSkills: string[], soughtSkills: string[]): number {
  if (!Array.isArray(agentSkills) || agentSkills.length === 0 || soughtSkills.length === 0) return 0;
  const agentSet = agentSkills.map((s) => s.toLowerCase());
  const matched = soughtSkills.filter((s) => agentSet.some((as) => as.includes(s.toLowerCase()) || s.toLowerCase().includes(as)));
  return Math.round((matched.length / soughtSkills.length) * 60); // up to 60 pts from skill overlap
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { project_description, seeking_skills } = body as {
      project_description?: string;
      seeking_skills?: string[];
    };

    if (!seeking_skills || !Array.isArray(seeking_skills) || seeking_skills.length === 0 || seeking_skills.length > 20 || seeking_skills.some((s) => typeof s !== "string" || !s.trim() || s.length > 100) || (project_description !== undefined && (typeof project_description !== "string" || project_description.length > 2000))) {
      return NextResponse.json({ error: "seeking_skills must be a non-empty array" }, { status: 400 });
    }

    

    // Fetch all active/idle agents (not offline)
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, description, owner, skills, location, availability")
      .neq("availability", "offline").eq("muted", false).limit(500);

    if (error) {
      Logger.error("[agents-match] Supabase error:", error.message);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    const agents: AgentRow[] = (data as AgentRow[]) ?? [];
    const keywords = seeking_skills.map((s) => s.toLowerCase());

    const scored = agents.map((agent) => {
      const descScore = keywordScore(agent.description ?? "", keywords);
      const sklScore = skillOverlap(agent.skills ?? [], seeking_skills ?? []);
      const compatibility_score = Math.min(100, descScore + sklScore);
      return { agent, compatibility_score };
    });

    // Sort descending by score, filter out 0-score
    scored.sort((a, b) => b.compatibility_score - a.compatibility_score);
    const matches = scored
      .filter((s) => s.compatibility_score > 0)
      .map(({ agent, compatibility_score }) => ({
        agent_id: agent.id,
        name: agent.name,
        owner: agent.owner,
        skills: Array.isArray(agent.skills) ? agent.skills : [],
        compatibility_score,
        location: agent.location ?? "Unknown",
      }));

    // Identify gaps: sought skills with no match
    const matchedSkillSet = new Set<string>();
    scored
      .filter((s) => s.compatibility_score > 0)
      .forEach(({ agent }) => {
        (agent.skills ?? []).forEach((s: string) => matchedSkillSet.add(s.toLowerCase()));
      });

    const community_gaps = seeking_skills.filter((s) =>
      !matchedSkillSet.has(s.toLowerCase()) &&
      !matchedSkillSet.has(s.toLowerCase().split("-")[0])
    );

    

    return NextResponse.json({ matches, community_gaps });
  } catch (err) {
    Logger.error("[agents-match] Unexpected error:", String(err));
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
