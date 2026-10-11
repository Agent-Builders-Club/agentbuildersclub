"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const partners = [
  {
    name: "FTW DAO",
    image: "/ftwdao-logo.png",
    url: "https://fwtx.city",
    tagline: "Community Partner",
  },
];

const venuePartners = [
  {
    name: "The Copper Wall",
    image: "/copper-wall-venue.png",
    url: "https://thecopperwall.com/",
    location: "Fort Worth, TX",
  },
  {
    name: "Spark Coworking",
    image: "/spark-arlington.png",
    url: "https://sparkcoworking.com/arlington/",
    location: "Arlington, TX",
  },
  {
    name: "The DEC Network",
    image: "/the-dec-network-fort-worth.png",
    url: "https://thedec.co/",
    location: "Fort Worth, TX",
  },
  {
    name: "Office Evolution Southlake",
    image: "/office-evolution-southlake.webp",
    url: "https://www.officeevolution.com/locations/usa/texas/southlake/",
    location: "Southlake, TX",
  },
  {
    name: "25N Coworking",
    image: "/25n-coworking-frisco.png",
    url: "https://25ncoworking.com/locations/frisco-tx",
    location: "Frisco, TX",
  },
];

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

export function WorkWithUsClient() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-border px-5 md:px-8 pt-32 md:pt-40 pb-20 md:pb-28">
        <div className="mx-auto max-w-5xl">
          <motion.p
            {...stagger(0)}
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-5 flex items-center gap-2"
          >
            <span className="inline-block h-px w-6 bg-accent/60" />
            Agent Builders Club
          </motion.p>
          <motion.h1
            {...stagger(1)}
            className="font-display text-5xl sm:text-6xl lg:text-[80px] leading-[0.98] tracking-tight text-text"
          >
            Build something
            <br />
            <span className="underline-accent">that matters.</span>
          </motion.h1>
          <motion.p
            {...stagger(2)}
            className="mt-7 text-base sm:text-lg text-muted leading-relaxed max-w-2xl"
          >
            Meet other AI builders in Dallas–Fort Worth. Come to a meetup,
            share a project, offer a venue, or help support the community.
            Start with the calendar or tell us how you want to get involved.
          </motion.p>
        </div>
      </section>

      {/* Community purpose */}
      <section className="border-b border-border px-5 md:px-8 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
            <div className="lg:col-span-5">
              <motion.p
                {...stagger(0)}
                className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-5 flex items-center gap-2"
              >
                <span className="inline-block h-px w-6 bg-accent/60" />
                The Node
              </motion.p>
              <motion.h2
                {...stagger(1)}
                className="font-display text-4xl sm:text-5xl lg:text-[60px] leading-[1.02] tracking-tight text-text"
              >
                Meet the people
                <br />
                behind the projects.
              </motion.h2>
            </div>
            <div className="lg:col-span-7">
              <div className="space-y-4 text-base sm:text-lg text-muted leading-[1.65]">
                <motion.p {...stagger(2)}>
                  The Node is our meetup for people interested in building with AI.
                  Bring a project, a question, or something you want to learn.
                  Check the event listing for the format, location, and RSVP details.
                </motion.p>
                <motion.p {...stagger(3)}>
                  Share useful tools, open-source work, and what you learned along
                  the way. The focus is learning from each other, not sales pitches.
                </motion.p>
              </div>
              <motion.dl
                {...stagger(4)}
                className="mt-9 grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border"
              >
                {[
                  { value: "Meet", label: "Other builders" },
                  { value: "Share", label: "Useful projects" },
                  { value: "Learn", label: "From each other" },
                  { value: "DFW", label: "Local community" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-surface px-4 py-5">
                    <dt className="font-display text-3xl text-accent leading-none">
                      {stat.value}
                    </dt>
                    <dd className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted leading-snug">
                      {stat.label}
                    </dd>
                  </div>
                ))}
              </motion.dl>
            </div>
          </div>
        </div>
      </section>

      {/* Ways to work with us */}
      <section className="border-b border-border px-5 md:px-8 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <motion.div
            {...stagger(0)}
            className="mb-12 md:mb-16 flex items-baseline justify-between gap-4"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
              Ways to Get Involved
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim tabular-nums">
              01 – 04
            </p>
          </motion.div>
          <div className="border-t border-border">
            {[
              { num: "01", label: "Attendee", title: "Come to a meetup", desc: "You don't need a finished project to take part. Browse the calendar, read the event details, and RSVP through Luma. Have a question before coming? Ask us.", action: "Ask about attending" },
              { num: "02", label: "Project Presenter", title: "Show what you're building", desc: "Share an agent, an automation, or a useful open-source tool. Tell us what it does, what you've learned, and what you'd like feedback on so we can discuss a presentation.", action: "Propose a project demo" },
              { num: "03", label: "Venue Host", title: "Offer a space in DFW", desc: "Have a place where builders can meet? Send the location, capacity, accessibility details, Wi-Fi setup, and available dates. We'll discuss whether the space fits a meetup.", action: "Offer a venue" },
              { num: "04", label: "Partner", title: "Support useful community work", desc: "Help with a venue, refreshments, or practical resources for builders. Tell us what you can contribute. Support should help people learn and share, not turn the meetup into a sales pitch.", action: "Discuss community support" },
            ].map((way, i) => (
              <motion.div
                key={way.num}
                {...stagger(i + 1)}
                className="border-b border-border"
              >
                <div className="grid grid-cols-12 gap-x-6 md:gap-x-8 gap-y-3 items-start py-8 md:py-10 lg:py-12">
                  <div className="col-span-12 md:col-span-3 lg:col-span-2">
                    <span className="font-display text-5xl sm:text-6xl md:text-[64px] lg:text-[76px] leading-none text-dim/70 tabular-nums">
                      {way.num}
                    </span>
                  </div>
                  <div className="col-span-12 md:col-span-9 lg:col-span-10">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-3">
                      {way.label}
                    </p>
                    <h3 className="font-display text-2xl sm:text-3xl lg:text-[34px] leading-[1.15] tracking-tight text-text mb-3">
                      {way.title}
                    </h3>
                    <p className="text-[15px] sm:text-base text-muted leading-[1.6] max-w-prose">
                      {way.desc}
                    </p>
                    <a
                      href="/contact"
                      className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-4 hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                    >
                      {way.action} <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="border-b border-border px-5 md:px-8 py-20 md:py-28">
        <div className="mx-auto max-w-6xl space-y-14">
          <div>
            <motion.p {...stagger(0)} className="font-mono text-[11px] uppercase tracking-[0.22em] text-dim mb-8">
              Partners
            </motion.p>
            <div className="mx-auto grid max-w-xl grid-cols-1 gap-6">
              {partners.map((partner, i) => (
                <motion.a
                  key={partner.name}
                  href={partner.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stagger(i + 1)}
                  className="group relative overflow-hidden rounded-lg border border-border aspect-video hover:border-accent transition-colors"
                  aria-label={`Visit ${partner.name}`}
                >
                  <Image
                    src={partner.image}
                    alt=""
                    fill
                    className="object-cover group-hover:opacity-80 transition-opacity"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-void/90 border-t border-border px-4 py-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-text">{partner.name}</span>
                    <span className="font-mono text-xs text-dim text-right">{partner.tagline}</span>
                  </div>
                </motion.a>
              ))}
            </div>
          </div>

          <div>
            <motion.p {...stagger(0)} className="font-mono text-[11px] uppercase tracking-[0.22em] text-dim mb-8">
              Venue Partners
            </motion.p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {venuePartners.map((venue, i) => (
                <motion.a
                  key={venue.name}
                  href={venue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stagger(i + 1)}
                  className="group relative overflow-hidden rounded-lg border border-border aspect-video hover:border-accent transition-colors"
                  aria-label={`Visit ${venue.name}`}
                >
                  <Image
                    src={venue.image}
                    alt=""
                    fill
                    className="object-cover group-hover:opacity-80 transition-opacity"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-void/90 border-t border-border px-4 py-3">
                    <span className="block font-mono text-sm text-text">{venue.name}</span>
                    <span className="mt-1 block font-mono text-xs text-dim">{venue.location}</span>
                  </div>
                </motion.a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-b border-border px-5 md:px-8 py-20 md:py-28 lg:py-32">
        <motion.div {...fade} className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-4">
            Start Here
          </p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] tracking-tight text-text">
            Find your way in.
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted">
            Check Luma for upcoming meetups and RSVP details. Use Contact for
            questions, project demos, venues, and partnerships. Discord is an
            optional place to connect between events.
          </p>
          <a
            href="https://luma.com/agentbuildersclub"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm sm:text-base font-medium text-void hover:bg-accent-light transition-colors"
          >
            View the meetup calendar
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
            <a href="/contact" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4 hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              Contact the organizers
            </a>
            <a href="https://discord.gg/q8kEquTu3z" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4 hover:text-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              Join Discord (optional)
            </a>
          </div>
        </motion.div>
      </section>
    </>
  );
}
