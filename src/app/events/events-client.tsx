import { siteConfig } from "@/config";

export function EventsClient() {
  return (
    <section className="border-b border-border px-5 md:px-8 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-4xl md:text-6xl text-text mb-10 text-center">Events</h1>
        <iframe
          src={siteConfig.lumaEmbedUrl}
          width="100%"
          className="h-[520px] md:h-[640px] w-full rounded border border-border"
          allowFullScreen
          title="Agent Builders Club Events"
        />
        <p className="mt-6 text-center text-sm text-muted">
          <a href={siteConfig.lumaUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
            Open the calendar on Luma
          </a>
        </p>
      </div>
    </section>
  );
}
