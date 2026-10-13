// Array APIs expose continuation in Link headers. Commit a complete read only;
// partial or malformed pages stay an error, not an apparently empty discussion.
export async function readAllComments<T>(
  url: string,
  parse: (value: unknown) => T[],
  signal: AbortSignal,
): Promise<T[]> {
  const origin = window.location.origin;
  const first = new URL(url, origin);
  const seen = new Set<string>();
  const rows: T[] = [];
  let next: URL | null = first;
  while (next) {
    if (seen.has(next.href)) throw new Error("Repeated comments page");
    seen.add(next.href);
    const response: Response = await fetch(next.href, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to load comments");
    rows.push(...parse(await response.json()));
    const link: string | undefined = response.headers
      .get("Link")
      ?.split(",")
      .find((part) => /rel="next"/.test(part));
    const target: string | undefined = link?.match(/<([^>]+)>/)?.[1];
    if (link && !target) throw new Error("Invalid comments continuation");
    next = target ? new URL(target, origin) : null;
    if (
      next &&
      (next.origin !== origin ||
        next.pathname !== first.pathname ||
        next.searchParams.get("post_id") !== first.searchParams.get("post_id"))
    ) {
      throw new Error("Invalid comments continuation");
    }
    const total = response.headers.get("X-Total-Count");
    if (
      !next &&
      total !== null &&
      (!/^\d+$/.test(total) || Number(total) !== rows.length)
    ) {
      throw new Error("Incomplete comments response");
    }
  }
  return rows;
}
