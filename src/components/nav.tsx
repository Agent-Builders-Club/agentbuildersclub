"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config";
import { useNavVisibility } from "@/hooks/use-nav-visibility";

export function Nav() {
  const [open, setOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const communityButtonRef = useRef<HTMLButtonElement>(null);
  const communityRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const { visible } = useNavVisibility({ hideThreshold: 80 });

  function closeMobile() {
    setOpen(false);
    menuButtonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        menuButtonRef.current?.focus();
      } else if (event.key === "Tab") {
        const controls = Array.from(
          navRef.current?.querySelectorAll<HTMLElement>("a[href], button") ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !navRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !navRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    function handleFocus(event: FocusEvent) {
      if (!navRef.current?.contains(event.target as Node)) {
        mobileRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocus);
    };
  }, [open]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    function handleResize() {
      setCommunityOpen(false);
      if (desktop.matches) {
        setOpen(false);
        if (navRef.current?.contains(document.activeElement)) {
          navRef.current.querySelector<HTMLAnchorElement>('a[href="/"]')?.focus();
        }
      }
    }
    desktop.addEventListener("change", handleResize);
    return () => desktop.removeEventListener("change", handleResize);
  }, []);

  useEffect(() => {
    if (!communityOpen) return;
    function dismiss(event: PointerEvent) {
      if (!communityRef.current?.contains(event.target as Node)) setCommunityOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [communityOpen]);

  const primaryLinkClass = "font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";
  const joinClass = "inline-flex shrink-0 items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-medium text-void transition-colors hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";

  return (
    <nav
      ref={navRef}
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? "Navigation menu" : "Main navigation"}
      data-visible={visible || open || communityOpen}
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent bg-gradient-to-b from-void/90 to-transparent transition-transform duration-300 ease-out data-[visible=false]:-translate-y-full motion-reduce:transition-none"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 md:px-8 md:py-5">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          aria-label="Agent Builders Club home"
          onClick={() => { closeMobile(); setCommunityOpen(false); }}
        >
          <Image
            src="/abc-logo.jpg"
            alt="Agent Builders Club"
            width={32}
            height={32}
            className="object-contain"
            priority
          />
          <span className="font-display text-lg tracking-tight text-text sm:text-xl md:text-[22px]">
            Agent Builders Club
          </span>
        </Link>

        <div className="hidden items-center gap-5 xl:flex">
          {siteConfig.navigation.map((link) => (
            <Link key={link.href} href={link.href} className={primaryLinkClass} onClick={() => setCommunityOpen(false)}>
              {link.label}
            </Link>
          ))}
          <div
            ref={communityRef}
            className="relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCommunityOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setCommunityOpen(false);
                communityButtonRef.current?.focus();
              }
            }}
          >
            <button
              ref={communityButtonRef}
              type="button"
              aria-label="Community links"
              aria-expanded={communityOpen}
              aria-controls="community-navigation"
              className={`${primaryLinkClass} flex items-center gap-1 py-2`}
              onClick={() => setCommunityOpen((value) => !value)}
            >
              Community <span aria-hidden="true">⌄</span>
            </button>
            {communityOpen && (
              <div id="community-navigation" className="absolute right-0 top-full mt-2 flex min-w-48 flex-col gap-1 rounded-lg border border-muted/30 bg-void p-3 shadow-lg" aria-label="Community resources">
                {siteConfig.communityNavigation.map((link) => (
                  <Link key={link.href} href={link.href} className={`${primaryLinkClass} px-2 py-3`} onClick={() => setCommunityOpen(false)}>
                    {link.label}
                  </Link>
                ))}
                <a href={siteConfig.discordUrl} target="_blank" rel="noopener noreferrer" className={`${primaryLinkClass} border-t border-muted/30 px-2 py-3`} onClick={() => setCommunityOpen(false)}>
                  Join Discord
                </a>
              </div>
            )}
          </div>
          <a href={siteConfig.lumaUrl} target="_blank" rel="noopener noreferrer" className={joinClass}>
            Join on Luma
          </a>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => { if (open) closeMobile(); else { setCommunityOpen(false); setOpen(true); } }}
          className="relative z-50 -mr-2 flex shrink-0 flex-col gap-[5px] p-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent xl:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          <span className={`block h-0.5 w-6 origin-center bg-text transition-[transform,opacity] duration-200 motion-reduce:transition-none ${open ? "translate-y-[7px] rotate-45" : ""}`} />
          <span className={`block h-0.5 w-6 bg-text transition-opacity duration-200 motion-reduce:transition-none ${open ? "opacity-0" : "opacity-100"}`} />
          <span className={`block h-0.5 w-6 origin-center bg-text transition-[transform,opacity] duration-200 motion-reduce:transition-none ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
        </button>
      </div>

      {open && (
        <div
          ref={mobileRef}
          id="mobile-navigation"
          className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-85px)] overflow-y-auto overscroll-contain bg-void px-5 pb-6 pt-4 md:px-8 xl:hidden"
        >
          <div className="mx-auto flex max-w-xl flex-col gap-4">
            <div className="flex flex-col gap-3" aria-label="Meetup navigation">
              {siteConfig.navigation.map((link) => (
                <Link key={link.href} href={link.href} onClick={closeMobile} className="font-display text-2xl tracking-tight text-text transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                  {link.label}
                </Link>
              ))}
            </div>
            <a href={siteConfig.lumaUrl} target="_blank" rel="noopener noreferrer" onClick={closeMobile} className={`${joinClass} py-3`}>
              Join on Luma
            </a>
            <div className="border-t border-muted/30 pt-4">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">Community resources</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {siteConfig.communityNavigation.map((link) => (
                  <Link key={link.href} href={link.href} onClick={closeMobile} className={`${primaryLinkClass} py-2`}>
                    {link.label}
                  </Link>
                ))}
                <a href={siteConfig.discordUrl} target="_blank" rel="noopener noreferrer" onClick={closeMobile} className={`${primaryLinkClass} py-2`}>
                  Join Discord
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
