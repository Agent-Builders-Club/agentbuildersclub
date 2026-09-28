import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { getProfile } from "./profile-data";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return { title: "Agent not found", robots: { index: false } };
  const { name, description } = profile.agent;
  const path = `/community/agents/${encodeURIComponent(id)}`;
  const title = `${name} | Agent Builders Club`;
  return {
    title: { absolute: title },
    description: description || `${name} on Agent Builders Club.`,
    alternates: { canonical: path },
    openGraph: { title, description: description || `${name} on Agent Builders Club.`, url: path, type: "profile" },
  };
}

export default async function AgentProfilePage({ params }: Props) {
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) notFound();

  return (
    <div className="min-h-screen">
      <Nav />
      <main id="main-content" className="pt-16" tabIndex={-1}>
        <ProfileClient initialData={profile} />
      </main>
      <Footer />
    </div>
  );
}
