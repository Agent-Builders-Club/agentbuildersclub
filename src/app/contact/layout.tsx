import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Agent Builders Club about meetups, presenting a project, sponsorship, venue partnerships, or a community question.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact — Agent Builders Club",
    description: "Questions, venue partnerships, and useful builds. Get in touch with the organizers.",
    url: "/contact",
    type: "website",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
