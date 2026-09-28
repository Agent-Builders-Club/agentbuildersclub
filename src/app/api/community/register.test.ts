import { describe, it, expect } from 'vitest';

// Validation helpers extracted from register/route
function validateRegister(body: {
  name?: unknown;
  description?: unknown;
  owner?: unknown;
  website?: unknown;
}) {
  const { name, description, owner, website } = body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return { ok: false, status: 400, error: 'Name is required' };
  }
  if (name.length > 50) {
    return { ok: false, status: 400, error: 'Name must be 50 characters or less' };
  }
  if (typeof description === 'string' && description.length > 500) {
    return { ok: false, status: 400, error: 'Description must be 500 characters or less' };
  }
  if (typeof owner === 'string' && owner.length > 100) {
    return { ok: false, status: 400, error: 'Owner must be 100 characters or less' };
  }
  if (typeof website === 'string' && website) {
    try {
      const url = new URL(website);
      if (!url.protocol || !url.host) {
        return { ok: false, status: 400, error: 'Website must be a valid URL' };
      }
    } catch {
      return { ok: false, status: 400, error: 'Website must be a valid URL' };
    }
  }
  return { ok: true };
}

describe('/api/community/register validation', () => {
  it('accepts a valid registration payload', () => {
    const result = validateRegister({
      name: 'MyAgent',
      description: 'A helpful agent',
      owner: 'Tyler',
      website: 'https://myagent.dev',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts minimal valid payload (name only)', () => {
    const result = validateRegister({ name: 'MinimalAgent' });
    expect(result.ok).toBe(true);
  });

  it('rejects missing name', () => {
    const result = validateRegister({});
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Name is required');
  });

  it('rejects empty string name', () => {
    const result = validateRegister({ name: '   ' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Name is required');
  });

  it('rejects name longer than 50 characters', () => {
    const result = validateRegister({ name: 'A'.repeat(51) });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Name must be 50 characters or less');
  });

  it('accepts name at exactly 50 characters', () => {
    const result = validateRegister({ name: 'A'.repeat(50) });
    expect(result.ok).toBe(true);
  });

  it('rejects description longer than 500 characters', () => {
    const result = validateRegister({ name: 'Valid', description: 'A'.repeat(501) });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Description must be 500 characters or less');
  });

  it('rejects owner longer than 100 characters', () => {
    const result = validateRegister({ name: 'Valid', owner: 'A'.repeat(101) });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Owner must be 100 characters or less');
  });

  it('rejects invalid website URL', () => {
    const result = validateRegister({ name: 'Valid', website: 'not-a-url' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Website must be a valid URL');
  });

  it('rejects website URL without protocol', () => {
    const result = validateRegister({ name: 'Valid', website: 'example.com' });
    expect(result.ok).toBe(false);
  });

  it('accepts valid https website', () => {
    const result = validateRegister({ name: 'Valid', website: 'https://example.com' });
    expect(result.ok).toBe(true);
  });

  it('accepts valid http website', () => {
    const result = validateRegister({ name: 'Valid', website: 'http://localhost:3000' });
    expect(result.ok).toBe(true);
  });
});
