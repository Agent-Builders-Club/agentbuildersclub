import { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { EventsClient } from "./events-client";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Meetups & Events";
  return {
    title,
    description:
      "Meetups for AI builders. Find current dates and RSVP on the Agent Builders Club Luma calendar.",
    openGraph: {
      title: `${title} — Agent Builders Club`,
      description:
        "Meetups for AI builders. Find current dates and RSVP on the Agent Builders Club Luma calendar.",
      type: "website",
      url: "/events",
    },
    alternates: { canonical: "/events" },
  };
}

export default async function EventsPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main id="main-content" className="pt-16">
        <EventsClient />
      </main>
      <Footer />
    </div>
  );
}
