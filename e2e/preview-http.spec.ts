import { expect, test } from "@playwright/test";

// Preservation contract: the copied calculator's unique assertions now cross
// the production HTTP route, not another implementation of its algorithm.
const cases = [
  {
    name: "word character line and read-time envelope",
    content: "Hello world this is a test",
    expected: {
      wordCount: 6,
      charCount: 26,
      lineCount: 1,
      estimatedReadTime: "1 min",
    },
  },
  {
    name: "single character",
    content: "A",
    expected: { wordCount: 1, charCount: 1, lineCount: 1 },
  },
  {
    name: "multiline",
    content: "Line one\nLine two\nLine three",
    expected: { lineCount: 3, wordCount: 6, charCount: 28 },
  },
  {
    name: "short wrap boundary",
    content: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    expected: { wouldWrapAt: [26, 26, 26, 26] },
  },
  {
    name: "long wrap boundary",
    content: "A".repeat(50),
    expected: { wouldWrapAt: [40, 50, 50, 50] },
  },
  {
    name: "long reading time",
    content: Array.from({ length: 400 }, (_, i) => `word${i}`).join(" "),
    expected: { estimatedReadTime: "2 min", wordCount: 400 },
  },
];
for (const row of cases)
  test(`production preview: ${row.name}`, async ({ request }) => {
    const response = await request.post("/api/community/preview", {
      data: { content: row.content },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject(row.expected);
  });
for (const content of [null, 123])
  test(`production preview rejects ${content === null ? "null" : "numeric"} content`, async ({
    request,
  }) => {
    const response = await request.post("/api/community/preview", {
      data: { content },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "Content is required" });
  });
