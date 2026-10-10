"use client";

import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config";

export function Footer() {
  return (
    <footer className="border-t border-border bg-void">
      <div className="mx-auto max-w-7xl px-5 md:px-8 py-14 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 md:gap-8">
          <div className="md:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5"
              aria-label={`${siteConfig.name} home`}
            >
              <Image
                src="/abc-logo.jpg"
                alt={siteConfig.name}
                width={28}
                height={28}
                className="object-contain"
              />
              <span className="font-display text-xl tracking-tight text-text">
                {siteConfig.name}
              </span>
            </Link>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              Meetups for AI builders
            </p>
            <p className="mt-4 text-[14px] sm:text-[15px] text-muted leading-[1.6] max-w-sm">
              Born in DFW. Meet other builders, share what you&apos;re working on,
              and learn together.
            </p>
            <a
              href={`mailto:${siteConfig.contactEmail}`}
              className="mt-4 inline-block text-[14px] text-muted hover:text-text transition-colors break-all"
            >
              {siteConfig.contactEmail}
            </a>
          </div>

          <nav aria-label="Main footer navigation">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent mb-5">
              Get together
            </p>
            <ul className="space-y-3">
              {siteConfig.navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[14px] text-muted hover:text-text transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Meetups and social links">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent mb-5">
              Stay connected
            </p>
            <ul className="space-y-3">
              {[
                { href: siteConfig.lumaUrl, label: "Meetup calendar" },
                { href: siteConfig.discordUrl, label: "Discord" },
                { href: "https://www.linkedin.com/company/agentbuildersclub", label: "LinkedIn" },
                { href: "https://x.com/agntbuilderclub", label: "X" },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] text-muted hover:text-text transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Community resources">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-5">
              Community resources
            </p>
            <ul className="space-y-3">
              {siteConfig.communityNavigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[14px] text-muted hover:text-text transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-5 md:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-dim text-center md:text-left">
            © {new Date().getFullYear()} {siteConfig.name}
          </p>
          <div className="flex items-center gap-5 text-[13px]">
            <Link
              href="/privacy"
              className="text-dim hover:text-text transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-dim hover:text-text transition-colors"
            >
              Terms
            </Link>
            <a
              href="https://github.com/Agent-Builders-Club/agentbuildersclub"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dim hover:text-text transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
