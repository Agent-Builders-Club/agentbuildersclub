import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Playfair_Display, Karla } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["700", "900"],
  style: ["normal", "italic"],
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0908" },
    { media: "(prefers-color-scheme: light)", color: "#0a0908" },
  ],
  colorScheme: "dark",
};

export async function generateMetadata(): Promise<Metadata> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.agentbuildersclub.dev";

  return {
    metadataBase: new URL(base),
    alternates: {
      canonical: base,
    },
    title: {
      default: "Agent Builders Club — Global AI Builder Community",
      template: "%s | Agent Builders Club",
    },
    description:
      "A global AI builder community for people learning, building, sharing, and shipping AI agents. Born in DFW. Built for the world.",
    keywords: [
      "AI builder community",
      "AI agents",
      "agent builders",
      "local AI models",
      "AI agent community",
      "AI builder meetup",
      "global AI community",
      "AI workflow automation",
      "agentic AI",
      "agentbuildersclub.dev",
    ],
    openGraph: {
      type: "website",
      siteName: "Agent Builders Club",
      url: base,
      locale: "en",
      title: "Agent Builders Club — Global AI Builder Community",
      description:
        "A global AI builder community for people learning, building, sharing, and shipping AI agents. Born in DFW. Built for the world.",
      images: [
        {
          url: "/abc-banner.jpg",
          width: 1200,
          height: 630,
          alt: "Agent Builders Club — Global AI Builder Community",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Agent Builders Club — Global AI Builder Community",
      description:
        "A global AI builder community for people learning, building, sharing, and shipping AI agents. Born in DFW. Built for the world.",
      images: ["/abc-banner.jpg"],
    },
    other: {
      "geo.region": "GLOBAL",
      "geo.placename": "Global — founded in Dallas-Fort Worth",
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body
        className={`${playfair.variable} ${karla.variable} bg-background text-foreground font-sans antialiased`}
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        suppressHydrationWarning
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent focus:text-void focus:font-mono focus:text-sm focus:uppercase focus:tracking-widest"
        >
          Skip to main content
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
