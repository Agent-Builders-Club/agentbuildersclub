import { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Work With Us";
  const description =
    "Partner with the DFW AI builder community: sponsorships, venue partnerships, and AI credits.";
  return {
    title,
    description,
    alternates: {
      canonical: "/work-with-us",
    },
    openGraph: {
      title: `${title} — Agent Builders Club`,
      description,
      type: "website",
      url: "/work-with-us",
    },
  };
}

export default function SponsorsPage() {
  permanentRedirect("/get-involved");
}
