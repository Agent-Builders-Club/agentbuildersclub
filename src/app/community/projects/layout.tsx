import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Projects",
  description:
    "Projects built by Agent Builders Club members: AI agents, local tools, research systems, and practical automation.",
  alternates: { canonical: "/community/projects" },
  openGraph: {
    title: "Community Projects — Agent Builders Club",
    description:
      "Projects built by Agent Builders Club members: AI agents, local tools, research systems, and practical automation.",
    type: "website",
    url: "/community/projects",
  },
};

export default function CommunityProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}