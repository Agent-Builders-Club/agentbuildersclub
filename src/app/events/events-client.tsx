"use client";

import Image from "next/image";

import { motion } from "framer-motion";
import { siteConfig } from "@/config";

interface EventClientProps {
  eventSchemaJson?: string;
  faqSchemaJson: string;
}

const ease = [0.25, 0.1, 0.25, 1] as const;

const fade = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease },
};

function stagger(i: number) {
  return { ...fade, transition: { duration: 0.7, ease, delay: i * 0.08 } };
}

const pastEvents = [
  {
    slug: "dfw-node-06",
    title: "DFW Node 06 — Hermes",
    date: "June 28, 2026",
    image: "/node-06-hermes-arlington-03.webp",
    description:
      "Hermes Agent launch event at Spark Coworking Arlington. The community's own AI agent made its debut — live demo, real conversations, and a look at what's next for the DFW builder ecosystem.",
    stats: [
      { value: "Spark Coworking", label: "Arlington" },
      { value: "Jun 28", label: "2026" },
    ],
  },
  {
    slug: "dfw-node-05",
    title: "DFW Node 05 — Claude Tools",
    date: "June 3, 2026",
    image: "/node-05-claude-tools-southlake-01.webp",
    description:
      "DFW builders gathered at Office Evolution Southlake for an honest conversation about the AI tools actually on their desks — Cursor, Claude Code, OpenCode, OpenAI, Hermes, OpenClaw, and more. No slides, no pitches — just builders sharing what's working, what isn't, and what keeps giving them trouble.",
    stats: [
      { value: "Tools", label: "On The Desk" },
      { value: "Southlake", label: "Office Evolution" },
    ],
  },
  {
    slug: "dfw-node-04",
    title: "DFW Node 04 — Frisco",
    date: "May 15, 2026",
    image: "/node-04-frisco-01.jpeg",
    description:
      "Claude In The Wild Meetup. Informal meetup where people are putting Claude to work on real projects and sharing what actually helps in day-to-day use. Heavy token users showing workflows, automations, research helpers, writing tools, and practical setups.",
    stats: [
      { value: "Claude", label: "In The Wild" },
      { value: "25N Coworking", label: "Frisco Host" },
    ],
  },
  {
    slug: "dfw-node-03",
    title: "DFW Node 03 — Fort Worth",
    date: "May 6, 2026",
    image: "/node-03-meetup.png",
    description:
      "Hands-on Mac Mini + OpenClaw install workshop. Live demo of the Mac Mini OpenClaw setup. Great networking and builders of all levels.",
    stats: [
      { value: "Live Demo", label: "Mac Mini OpenClaw" },
      { value: "Workshop", label: "Hands-on Setup" },
    ],
  },
  {
    slug: "dfw-node-02",
    title: "DFW Node 02",
    date: "April 15, 2026",
    image: "/spark-arlington.png",
    description:
      "A meetup for DFW builders tinkering with AI agents and OpenClaw. No agenda, no slides — just people with laptops and coffee.",
    stats: null,
  },
  {
    slug: "clawcon-dfw",
    title: "ClawCon DFW",
    date: "March 24, 2026",
    image: "/clawcon-1.webp",
    description:
      "Our inaugural meetup. DFW builders gathered at the Choctaw Stadium district for live demos, lightning talks, and real conversations about shipping AI projects.",
    stats: [
      { value: "4", label: "Live Demos" },
      { value: "First", label: "DFW Meetup" },
    ],
  },
];

export function EventsClient({ eventSchemaJson, faqSchemaJson }: EventClientProps) {
  return (
    <>
      {/* JSON-LD: only emit an Event object when a verified upcoming event exists. */}
      {eventSchemaJson && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: eventSchemaJson }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqSchemaJson }}
      />
      <div className="min-h-screen">
          {/* Header */}
          <section className="border-b border-border px-5 md:px-8 py-16 md:py-24">
            <div className="mx-auto max-w-4xl text-center">
              <motion.p
                {...stagger(0)}
                className="font-mono text-xs uppercase tracking-[0.2em] text-accent mb-4"
              >
                Agent Builders Club DFW
              </motion.p>
              <motion.h1
                {...stagger(1)}
                className="font-display text-4xl md:text-6xl tracking-wider text-text leading-none"
              >
                Events
              </motion.h1>
              <motion.p {...stagger(2)} className="mt-4 text-base text-muted max-w-xl mx-auto">
                Meet DFW builders working on AI agents and practical tools.
                Explore projects, share what you are learning, and find the next meetup on Luma.
              </motion.p>
            </div>
          </section>

          {/* Calendar */}
          <section className="border-b border-border px-5 md:px-8 py-20 md:py-28">
            <div className="mx-auto max-w-5xl">
              <motion.p
                {...stagger(0)}
                className="font-mono text-xs uppercase tracking-[0.2em] text-accent mb-10 text-center"
              >
                Upcoming
              </motion.p>
              <motion.div
                {...stagger(1)}
                className="relative w-full h-[520px] md:h-[640px]"
              >
                <iframe
                  src={siteConfig.lumaEmbedUrl}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: "1px solid #bfcbda88", borderRadius: "4px", position: "absolute", top: 0, left: 0 }}
                  allowFullScreen
                  aria-hidden="false"
                  tabIndex={0}
                  title="Agent Builders Club Events"
                />
              </motion.div>
              {/* Always available, even when the cross-origin calendar is empty or blocked. */}
              <div className="mt-8 border-t border-border pt-6 text-center">
                <p className="text-base text-muted mb-5">{siteConfig.eventFallback}</p>
                <a
                  href={siteConfig.lumaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block border border-border px-6 py-3 font-mono text-sm uppercase tracking-widest text-muted hover:border-accent hover:text-accent transition-colors"
                >
                  View meetups on Luma
                </a>
              </div>
            </div>
          </section>

          {/* Past */}
          {pastEvents.length > 0 && (
            <section className="border-b border-border px-5 md:px-8 py-20 md:py-28">
              <div className="mx-auto max-w-5xl">
                <motion.p
                  {...stagger(0)}
                  className="font-mono text-xs uppercase tracking-[0.2em] text-dim mb-10 text-center"
                >
                  Past Events
                </motion.p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  {pastEvents.map((event, i) => (
                    <motion.div key={event.slug} {...stagger(i + 1)}>
                      <div className="relative overflow-hidden border border-border aspect-video mb-4">
                        <Image
                          src={event.image}
                          alt={event.title}
                          fill
                          sizes="(min-width: 768px) 50vw, 100vw"
                          className="object-cover opacity-70"
                        />
                        <div className="absolute top-4 left-4 border border-border bg-void/90 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                          Past
                        </div>
                      </div>
                      <h2 className="font-display text-4xl md:text-5xl tracking-wider text-text mb-2">
                        {event.title}
                      </h2>
                      <p className="font-mono text-sm text-dim uppercase tracking-widest mb-4">
                        {event.date}
                      </p>
                      <p className="text-base text-muted leading-relaxed mb-6">
                        {event.description}
                      </p>
                      {event.stats && (
                        <div className="flex flex-wrap gap-x-8 gap-y-6 border-t border-border pt-6">
                          {event.stats.map((stat) => (
                            <div key={stat.label} className="min-w-0">
                              <p className="font-display text-3xl text-accent break-words">
                                {stat.value}
                              </p>
                              <p className="font-mono text-[10px] uppercase tracking-widest text-dim mt-1 break-words">
                                {stat.label}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* CTA */}
          <section className="px-5 md:px-8 py-20 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <motion.p {...stagger(0)} className="font-mono text-xs uppercase tracking-widest text-dim mb-4">
                Stay in the Loop
              </motion.p>
              <motion.h2 {...stagger(1)} className="font-display text-3xl md:text-5xl tracking-wider text-text mb-6">
                Come to the next Meetup.
              </motion.h2>
              <motion.p {...stagger(2)} className="text-base text-muted mb-8">
                Bring a build to share or a question to explore. Check each meetup on Luma
                for the date, location, format, and RSVP details.
              </motion.p>
              <motion.div {...stagger(3)} className="flex justify-center">
                <a
                  href={siteConfig.discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border px-8 py-4 font-mono text-sm uppercase tracking-widest text-muted hover:border-accent hover:text-accent transition-colors text-center"
                >
                  Join Discord
                </a>
              </motion.div>
            </div>
          </section>
      </div>
    </>
  );
}

export type { EventClientProps };
