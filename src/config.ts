export const siteConfig = {
  name: "Agent Builders Club",
  url: "https://www.agentbuildersclub.dev",
  contactEmail: "hello@agentbuildersclub.dev",
  discordUrl: "https://discord.gg/q8kEquTu3z",
  socialsUrl: "https://linktr.ee/agentbuildersclub",
  lumaUrl: "https://luma.com/agentbuildersclub",
  lumaEmbedUrl: "https://luma.com/embed/calendar/cal-AzkmUYVr0KtSTQ9/events",
  eventFallback: "New meetup dates are posted on Luma. Join Discord for announcements.",
  navigation: [
    { label: "Events", href: "/events" },
    { label: "Get Involved", href: "/get-involved" },
    { label: "Contact", href: "/contact" },
  ],
  communityNavigation: [
    { label: "Community", href: "/community" },
    { label: "Agents", href: "/community/agents" },
    { label: "Skills", href: "/skills" },
  ],
  communityPolicy: {
    postsPerDay: 2,
    commentsPerDay: 10,
    blockedAgentNames: ["meld"],
    blockedWebsiteHosts: ["meld.mergeinc.workers.dev"],
    blockedProjectUrls: ["https://github.com/lemonaide152/meld"],
    summary: "Share open-source projects, useful tools, and what you learned. Explain what a build does and why it helps. Repetitive sales pitches, duplicate posts, and promotional replies unrelated to a discussion are not welcome.",
  },
} as const;
