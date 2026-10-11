"use client";

import { useRef, useState, type FormEvent } from "react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { siteConfig } from "@/config";

const fieldClass = "mt-2 block w-full rounded-md border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const topics = [
  { value: "attendee", label: "Attendee — meetup question" },
  { value: "sponsor", label: "Partner — support the community" },
  { value: "venue", label: "Venue — host a meetup" },
  { value: "presenting", label: "Presenting — share a build" },
  { value: "other", label: "Other" },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function ContactPage() {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [inquiryId, setInquiryId] = useState("");
  const inFlight = useRef(false);
  const completed = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || completed.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const message = String(values.get("message") ?? "").trim();
    if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter your name, a valid email address, and a message that is not blank.");
      requestAnimationFrame(() => feedback.current?.focus());
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError("");
    setSuccess("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, topic: values.get("topic"), website: values.get("website") ?? "" }),
        signal: controller.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      // Saving an inquiry and email-provider acceptance are separate outcomes.
      if (isObject(data) && data.saved === true) {
        completed.current = true;
        if (typeof data.id === "string" && data.id.trim()) setInquiryId(data.id);
        setSuccess(data.notification_status === "accepted"
          ? "Your inquiry was saved. The email provider accepted the organizer notification; inbox delivery is not confirmed."
          : data.notification_status === "pending" || data.notification_status === "sending"
            ? "Your inquiry was saved. The organizer notification is queued or being sent; email acceptance and delivery are not yet confirmed. Please email us directly if your question is urgent."
            : data.notification_status === "failed"
              ? "Your inquiry was saved, but email acceptance failed. The saved inquiry remains available to the organizers for a notification retry. Please email us directly if your question is urgent; do not submit the form again."
              : "Your inquiry was saved. Organizer notification status is not confirmed. Please email us directly if your question is urgent; do not submit the form again.");
        return;
      }
      if (!response.ok) {
        setError(response.status === 429
          ? "Too many messages. Please wait before trying again, or email us directly."
          : isObject(data) && typeof data.error === "string" && data.error.trim()
            ? data.error
          : "Unable to confirm your message was saved. Your draft is still here. Try again or email us directly.");
        return;
      }
      setError("Unable to confirm your message was saved. Your draft is still here. Email us directly if you are unsure before trying again.");
    } catch {
      setError("Unable to confirm receipt. Your draft is still here. A connection problem can occur after a message is saved; email us directly if you are unsure before trying again.");
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main id="main-content">
        <section className="border-b border-border px-5 pb-16 pt-32 md:px-8 md:pb-24 md:pt-40">
          <div className="mx-auto max-w-5xl">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Agent Builders Club</p>
            <h1 className="font-display text-5xl leading-[0.98] tracking-tight text-text sm:text-6xl lg:text-[80px]">Contact</h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">Have a meetup question, a space to share, or a build to present? Get in touch with the organizers.</p>
          </div>
        </section>
        <section aria-labelledby="contact-form-heading" className="border-b border-border px-5 py-16 md:px-8 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <aside className="space-y-6">
              <h2 className="font-display text-3xl text-text">Start a conversation.</h2>
              <p className="leading-relaxed text-muted">Prefer email? You can reach the organizers directly.</p>
              <a href={`mailto:${siteConfig.contactEmail}`} className="inline-block break-all text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{siteConfig.contactEmail}</a>
              {siteConfig.discordUrl && (
                <p className="leading-relaxed text-muted">For community discussions, <a href={siteConfig.discordUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">join Discord<span className="sr-only"> (opens in a new tab)</span></a>.</p>
              )}
            </aside>
            <div>
              <h2 id="contact-form-heading" className="mb-3 font-display text-3xl text-text">Send an inquiry</h2>
              <p id="contact-help" className="mb-8 leading-relaxed text-muted">All fields are required. Contact details are used to respond to your inquiry, not published in the community feed. Please do not include passwords or other sensitive information.</p>
              <form onSubmit={submit} aria-describedby="contact-help" aria-busy={pending}>
                <fieldset disabled={pending || Boolean(success)} className="space-y-6">
                  <legend className="sr-only">Your inquiry</legend>
                  <div>
                    <label htmlFor="contact-name" className="text-sm font-medium text-text">Name</label>
                    <input id="contact-name" name="name" type="text" autoComplete="name" required maxLength={100} className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="text-sm font-medium text-text">Email</label>
                    <input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor="contact-topic" className="text-sm font-medium text-text">Topic</label>
                    <select id="contact-topic" name="topic" required defaultValue="attendee" className={fieldClass}>
                      {topics.map(topic => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="contact-message" className="text-sm font-medium text-text">Message</label>
                    <textarea id="contact-message" name="message" rows={7} required maxLength={5000} aria-describedby="contact-message-help" className={`${fieldClass} resize-y`} />
                    <p id="contact-message-help" className="mt-2 text-sm text-muted">Up to 5,000 characters.</p>
                  </div>
                  <div hidden aria-hidden="true">
                    <label htmlFor="contact-website">Leave this field empty</label>
                    <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" maxLength={200} />
                  </div>
                  <button type="submit" disabled={pending || Boolean(success)} className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 py-3 font-medium text-void hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Sending…" : "Send message"}</button>
                </fieldset>
                <div ref={feedback} tabIndex={-1} className="mt-6 text-sm leading-relaxed text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                  <p role="status" aria-live="polite" aria-atomic="true">{pending ? "Submitting your inquiry. Please wait." : success}</p>
                  {inquiryId && <p>Inquiry reference: {inquiryId}</p>}
                  {success && <a className="text-accent underline underline-offset-4" href={`mailto:${siteConfig.contactEmail}`}>Email {siteConfig.contactEmail}</a>}
                  {error && <p role="alert">{error} <a className="text-accent underline underline-offset-4" href={`mailto:${siteConfig.contactEmail}`}>Email {siteConfig.contactEmail}</a></p>}
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
