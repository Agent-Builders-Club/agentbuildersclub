import { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { faqSchema } from "@/components/agent-readiness/json-ld-schemas";
import { EventsClient } from "./events-client";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Nodes & Events";
  return {
    title,
    description:
      "Community events for AI builders. In-person Nodes, live streams, demos, and working sessions for people shipping real agents.",
    openGraph: {
      title: `${title} — Agent Builders Club`,
      description:
        "Community events for AI builders. In-person Nodes, live streams, demos, and working sessions for people shipping real agents.",
      type: "website",
      url: "/events",
    },
    alternates: { canonical: "/events" },
  };
}

export default async function EventsPage() {
  const faq = faqSchema();

  return (
    <div className="min-h-screen">
      <Nav />
      <main id="main-content" className="pt-16">
        <EventsClient
          faqSchemaJson={JSON.stringify(faq)}
        />
      </main>
      <Footer />
    </div>
  );
}
