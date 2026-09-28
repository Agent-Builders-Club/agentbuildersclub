import { describe, it, expect } from 'vitest';

/**
 * Handler logic extracted from /api/community/preview
 */
function previewHandler(content: unknown) {
  if (!content || typeof content !== 'string') {
    return { status: 400, data: { error: 'Content is required' } };
  }

  const text = content;
  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const charCount = text.length;
  const estimatedReadTime = `${Math.max(1, Math.ceil(wordCount / 200))} min`;
  const lines = text.split('\n');
  const lineCount = lines.length;
  const avgLineLen = lineCount > 0 ? Math.round(charCount / lineCount) : 0;
  const wouldWrapAt = [40, 60, 80, 100].map((w) => avgLineLen > w ? w : avgLineLen);

  return {
    status: 200,
    data: { wordCount, charCount, estimatedReadTime, lineCount, wouldWrapAt },
  };
}

describe('/api/community/preview', () => {
  it('returns correct word, char, and line counts', () => {
    const result = previewHandler('Hello world this is a test');
    expect(result.status).toBe(200);
    expect(result.data.wordCount).toBe(6);
    expect(result.data.charCount).toBe(26);
    expect(result.data.lineCount).toBe(1);
    expect(result.data.estimatedReadTime).toBe('1 min');
  });

  it('handles single character correctly', () => {
    const result = previewHandler('A');
    expect(result.status).toBe(200);
    expect(result.data.wordCount).toBe(1);
    expect(result.data.charCount).toBe(1);
  });

  it('handles multiline content', () => {
    const result = previewHandler('Line one\nLine two\nLine three');
    expect(result.data.lineCount).toBe(3);
    expect(result.data.wordCount).toBe(6);
  });

  it('rejects null content', () => {
    const result = previewHandler(null);
    expect(result.status).toBe(400);
  });

  it('rejects non-string content', () => {
    const result = previewHandler(123);
    expect(result.status).toBe(400);
  });

  it('calculates wouldWrapAt based on average line length', () => {
    const result = previewHandler('ABCDEFGHIJKLMNOPQRSTUVWXYZ'); // 26 chars, 1 line
    // avgLineLen = 26, wouldWrapAt = [40, 60, 80, 100] all > 26 so result is 26 for all
    expect(result.data.wouldWrapAt).toEqual([26, 26, 26, 26]);
  });

  it('calculates wouldWrapAt for long lines', () => {
    const longLine = 'A'.repeat(50);
    const result = previewHandler(longLine);
    // avgLineLen = 50, wouldWrapAt[40] = 40, rest = 50
    expect(result.data.wouldWrapAt).toEqual([40, 50, 50, 50]);
  });

  it('estimates read time correctly for long content', () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const result = previewHandler(words);
    expect(result.data.estimatedReadTime).toBe('2 min'); // ceil(400/200) = 2
  });
});
