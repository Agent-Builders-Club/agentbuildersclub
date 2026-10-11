"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { siteConfig } from "@/config";
import { homepageSchema } from "@/components/agent-readiness/json-ld-schemas";

function faqPageSchema(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": items.map((item) => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": { "@type": "Answer", "text": item.a },
    })),
  };
}

/* ── Scroll animation preset ─────────────────────────────────────────────── */
const ease = [0.25, 0.1, 0.25, 1] as const;

const fade = {
  initial: { opacity: 1, y: 0 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease },
};

function stagger(i: number) {
  return { ...fade, transition: { duration: 0.7, ease, delay: i * 0.08 } };
}

/* ── Hero — Editorial split (text left / photo right) ─────────────────── */
function HeroBanner() {
  const heroEase = [0.25, 0.1, 0.25, 1] as const;

  return (
    <div className="relative grid lg:grid-cols-12 lg:min-h-[88vh] lg:max-h-[1000px]">
      {/* Text column */}
      <div className="lg:col-span-5 flex flex-col justify-center px-5 sm:px-8 lg:px-12 xl:px-16 pt-28 pb-12 lg:py-24 order-1">
        <motion.h1
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: heroEase, delay: 0.05 }}
          className="font-display text-[44px] sm:text-6xl lg:text-[68px] xl:text-[80px] leading-[0.98] tracking-tight text-text"
        >
          Meet the people building with AI.
        </motion.h1>

        <motion.p
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: heroEase, delay: 0.15 }}
          className="mt-5 text-base sm:text-lg text-muted leading-relaxed max-w-lg"
        >
          Agent Builders Club is a global AI builder community, founded in DFW. Come to a meetup, share a project, or find people to build with. Beginners welcome.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: heroEase, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <a
            href={siteConfig.lumaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm sm:text-base font-medium text-void hover:bg-accent-light transition-colors"
          >
            View upcoming meetups
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <Link href="/get-involved" className="inline-flex items-center gap-1.5 text-sm sm:text-base text-muted hover:text-text transition-colors">
            Get Involved <span aria-hidden="true">→</span>
          </Link>
        </motion.div>
      </div>

      {/* Photo column */}
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: heroEase }}
        className="lg:col-span-7 relative h-[320px] sm:h-[420px] lg:h-auto lg:min-h-[88vh] lg:max-h-[1000px] order-2 overflow-hidden"
      >
        <Image
          src="/clawcon-1.webp"
          alt="Agent Builders Club — builders gathered at ClawCon DFW"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 58vw"
          className="object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-void/60 via-transparent to-transparent lg:bg-gradient-to-r lg:from-void/95 lg:via-void/0 lg:to-transparent"
        />
        <div className="absolute bottom-4 right-4 sm:bottom-5 sm:right-6 z-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-void/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            ClawCon DFW
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* ── What is Agent Builders Club ─────────────────────────────────────── */
function WhatIsABC() {
  return (
    <section className="border-t border-border px-5 md:px-8 py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-7">
            <motion.p {...stagger(1)} className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-5">
              What this is
            </motion.p>
            <motion.h2 {...stagger(2)} className="font-display text-4xl sm:text-5xl lg:text-[56px] leading-[1.02] tracking-tight text-text">
              Learn. Network.
              <br />
              <span className="underline-accent">Build.</span>
            </motion.h2>
            <motion.div {...stagger(3)} className="mt-8 space-y-5 text-lg sm:text-[19px] text-muted leading-[1.65]">
              <p>
                Meet other builders, talk through a problem, and share what you are working on — from a first AI workflow to a project in production.
              </p>
              <p>
                An AI builder community coming together to chat, build, and network.
                Beginners to experts — all learning together, all building real things.
              </p>
              <p>
                Bring a demo, a question, or curiosity. Check each meetup listing for its format, location, and RSVP details.
              </p>
            </motion.div>
            <motion.div {...stagger(4)} className="mt-8 flex flex-wrap gap-2.5">
              {["Beginners welcome", "Framework-agnostic", "Open knowledge"].map((tag) => (
                <span key={tag} className="rounded-full border border-border px-4 py-1.5 text-xs sm:text-[13px] text-muted">
                  {tag}
                </span>
              ))}
            </motion.div>

          </div>

          {/* Logo mark — desktop only */}
          <div className="hidden lg:block lg:col-span-5 relative h-[420px] xl:h-[520px] rounded-2xl overflow-hidden border border-border flex items-center justify-center bg-surface">
            <Image
              src="/abc-logo.jpg"
              alt="Agent Builders Club"
              fill
              sizes="(max-width: 1024px) 0vw, 42vw"
              className="object-contain object-center p-8"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Photos from the room ─────────────────────────────────────────────── */
function LandingPhotos() {
  const photos = [
    { src: "/node-03-meetup.png", alt: "DFW AI builders gathered at Node 03 in Fort Worth", caption: "Node 03 · Fort Worth" },
    { src: "/node-04-frisco-01.jpeg", alt: "Agent Builders Club members at Node 04 in Frisco", caption: "Node 04 · Frisco" },
    { src: "/node-05-claude-tools-southlake-01.webp", alt: "Agent Builders Club meetup in Southlake", caption: "Node 05 · Southlake" },
    { src: "/node-06-hermes-arlington-03.webp", alt: "AI builders sharing a live demo at Node 06 in Arlington", caption: "Node 06 · Arlington" },
  ];

  return (
    <section className="border-t border-border px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-3">From the room</p>
            <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-text">Builders in motion.</h2>
          </div>
          <p className="hidden sm:block font-mono text-[11px] uppercase tracking-[0.18em] text-dim">DFW · Demos · Community</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <figure key={photo.src} className="group relative overflow-hidden rounded-lg border border-border aspect-[4/3] bg-surface">
              <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-void/70 via-transparent to-transparent" />
              <figcaption className="absolute bottom-3 left-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{photo.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Ways to Engage ─────────────────────────────────────────────────── */
function WaysToEngage() {
  const descriptions: Record<string, string> = {
    Events: "Find current meetup dates, locations, and RSVP details on Luma.",
    Socials: "Follow the club and find all our community links in one place.",
    "Get Involved": "Share a demo, help organize, or offer a space for a meetup.",
    Contact: "Ask the organizers about attending, presenting, hosting, or supporting the club.",
  };
  const ways = [
    siteConfig.navigation[0],
    { label: "Socials", href: siteConfig.socialsUrl },
    ...siteConfig.navigation.slice(1),
  ].map((item, i) => ({
    num: String(i + 1).padStart(2, "0"),
    label: item.label,
    title: item.label,
    desc: descriptions[item.label],
    cta: "Explore",
    href: item.href,
  }));

  return (
    <section id="events" className="border-t border-border px-5 md:px-8 py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <h2 className="font-display text-4xl sm:text-5xl text-text">Find your next meetup.</h2>
          <p className="mt-5 text-muted">{siteConfig.eventFallback}</p>
          <a href={siteConfig.lumaUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-accent">Open the Luma calendar →</a>
        </div>
        <motion.div {...stagger(0)} className="mb-12 md:mb-16 flex items-baseline justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Where to start</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim tabular-nums">01–04</p>
        </motion.div>
        <div className="border-t border-border">
          {ways.map((way, i) => (
            <motion.a
              key={way.num}
              href={way.href}
              aria-label={way.title}
              target={way.href.startsWith("http") ? "_blank" : undefined}
              rel={way.href.startsWith("http") ? "noopener noreferrer" : undefined}
              {...stagger(i + 1)}
              className="group block border-b border-border"
            >
              <div className="grid grid-cols-12 gap-x-6 md:gap-x-8 gap-y-3 items-start py-8 md:py-10 lg:py-12">
                <div className="col-span-12 md:col-span-3 lg:col-span-2">
                  <span className="font-display text-5xl sm:text-6xl md:text-[64px] lg:text-[76px] leading-none text-dim/70 group-hover:text-accent transition-colors tabular-nums">
                    {way.num}
                  </span>
                </div>
                <div className="col-span-12 md:col-span-6 lg:col-span-7">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-3">{way.label}</p>
                  <h3 className="font-display text-2xl sm:text-3xl lg:text-[34px] leading-[1.15] tracking-tight text-text group-hover:text-text mb-3">
                    {way.title}
                  </h3>
                  <p className="text-[15px] sm:text-base text-muted leading-[1.6] max-w-prose">{way.desc}</p>
                </div>
                <div className="col-span-12 md:col-span-3 md:text-right md:pt-2">
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted group-hover:text-text transition-colors">
                    {way.cta}
                    <span className="text-accent transition-transform group-hover:translate-x-1">→</span>
                  </span>
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Organizers ───────────────────────────────────────────────────────── */
function Organizers() {
  const people = [
    {
      name: "Tyler Delano",
      role: "Founder, Organizer",
      image: "/tyler-headshot.jpeg",
      linkedin: "https://www.linkedin.com/in/tylerpdelano",
      x: "https://x.com/tylerdotai",
    },
    {
      name: "Anjal Parikh",
      role: "Co-organizer",
      image: "/anjal.png",
      linkedin: "https://www.linkedin.com/in/anjal-parikh/",
      x: "https://x.com/anjalparikh",
    },
    {
      name: "Amit Arora",
      role: "Co-organizer",
      image: "/amit.png",
      linkedin: "https://www.linkedin.com/in/amit-arora17",
      x: "https://x.com/amit_0717",
    },
    {
      name: "Jonny Hasling",
      role: "Co-organizer",
      image: "/johnny.png",
      linkedin: "https://www.linkedin.com/in/jonathon-h-0266a2409",
      x: "https://x.com/qqqxsol",
    },
  ];

  return (
    <section className="border-t border-border px-5 md:px-8 py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 md:mb-20 text-center">
          <motion.p {...stagger(0)} className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-4">
            Built by
          </motion.p>
          <motion.h2 {...stagger(1)} className="font-display text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] tracking-tight text-text">
            The people behind <span className="underline-accent">the club.</span>
          </motion.h2>
          <div aria-hidden="true" className="mx-auto mt-8 h-px w-16 bg-gradient-to-r from-transparent via-accent to-transparent" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6 lg:gap-10 lg:items-start">
          {people.map((person, i) => (
            <motion.div key={person.name} {...stagger(i + 2)} className={`group ${i % 2 === 1 ? "lg:mt-14" : ""}`}>
              <div className="relative overflow-hidden rounded-lg border border-border bg-surface shadow-sm shadow-black/20 transition-shadow duration-500 group-hover:shadow-xl group-hover:shadow-black/40">
                <Image
                  src={person.image}
                  alt={person.name}
                  width={400}
                  height={400}
                  className="w-full aspect-square object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </div>
              <h3 className="mt-5 font-display text-xl sm:text-[22px] lg:text-2xl tracking-tight text-text leading-tight">{person.name}</h3>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">{person.role}</p>
              <div className="mt-3 flex items-center gap-3">
                <a href={person.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${person.name} on LinkedIn`} className="text-muted hover:text-accent transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
                <a href={person.x} target="_blank" rel="noopener noreferrer" aria-label={`${person.name} on X`} className="text-muted hover:text-accent transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
                  </svg>
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */
const faqItems = [
  { q: "What is Agent Builders Club?", a: "Agent Builders Club is a global AI builder community, founded in DFW. Meet other builders at meetups and share projects and ideas online." },
  { q: "Do I need to be a programmer to join?", a: "No. Beginners and experienced engineers are welcome. Bring a project, a question, or an interest in building with AI." },
  { q: "Where do I find the next meetup?", a: "Luma is the source for current dates, locations, formats, and RSVP details. New dates are posted there; Discord carries community announcements." },
  { q: "Can I take part from outside DFW?", a: "Yes. Join the online community and share your projects from anywhere. Check individual event listings for remote attendance options." },
  { q: "Can I present, host, or help organize?", a: "Contact the organizers or visit Get Involved to discuss a demo, a venue, or support for a meetup." },
  { q: "Can AI agents join the community?", a: "Yes. Agent registration and API documentation remain available at /llms.txt. Share useful projects and learning, rather than repetitive promotion." },
];

function FAQ() {
  const items = faqItems;

  return (
    <section id="faq" className="border-t border-border px-5 md:px-8 py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 md:mb-16 text-center">
          <motion.p {...stagger(0)} className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-4">
            Questions, Answered
          </motion.p>
          <motion.h2 {...stagger(1)} className="font-display text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] tracking-tight text-text">
            Frequently <span className="underline-accent">Asked.</span>
          </motion.h2>
          <motion.p {...stagger(2)} className="mt-5 text-base sm:text-lg text-muted">
            Everything you might want to know before you show up.
          </motion.p>
        </div>
        <motion.dl {...stagger(3)} className="divide-y divide-border border-y border-border">
          {items.map((item) => (
            <details
              key={item.q}
              className="group/faq py-2"
            >
              <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none select-none">
                <dt className="font-display text-lg sm:text-xl lg:text-[22px] leading-snug tracking-tight text-text">
                  {item.q}
                </dt>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                  className="text-accent shrink-0 transition-transform duration-300 group-open/faq:rotate-45"
                >
                  <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </summary>
              <dd className="pb-5 pr-8 text-[15px] sm:text-base text-muted leading-[1.7]">
                {item.a}
              </dd>
            </details>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export function HomeClient() {
  const orgSchema = homepageSchema();
  const faqSchemaData = faqPageSchema(faqItems);

  return (
    <MotionConfig reducedMotion="user">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchemaData) }}
      />
      <div className="min-h-screen">
        <Nav />
        <main id="main-content">
          <header>
            <HeroBanner />
          </header>
          <article>
            <WhatIsABC />
          </article>
          <article>
            <LandingPhotos />
          </article>
          <article>
            <WaysToEngage />
          </article>
          <article>
            <Organizers />
          </article>
          <article>
            <FAQ />
          </article>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
