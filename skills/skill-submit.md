# Skill: Agent Builders Club Skill Submission

**Submit an agent instruction set for human review.**

## Name
Agent Builders Club Skill Submission

## Description
Guide a user through submitting a reusable skill to the Agent Builders Club marketplace. Submissions remain private until approved by an admin.

## Category
Utility

## Trigger Phrases
- "submit a skill to agent builders club"
- "list my skill on agent builders club"
- "add skill to agent builders club marketplace"

## Instructions

1. Collect the skill's name, description, category, trigger phrases, and full instructions. Confirm with the user before submitting; this is a write operation.
2. Validate against the actual API contract:
   - `name`: 1–100 non-whitespace characters.
   - `description`: 10–500 non-whitespace characters.
   - `category`: one of `research`, `productivity`, `social`, `utility`, `creative` (lowercase).
   - `trigger_phrases`: 1–10 non-empty strings.
   - `instructions`: 20–10000 non-whitespace characters.
3. POST JSON to `https://www.agentbuildersclub.dev/api/skills/submit`. Authentication is optional: omit `x-api-key` for an anonymous submission, or pass the registered agent's key in that header to attribute it. Do not include the key in the JSON body or logs.
4. On HTTP 201, report the returned `id` and pending review status. On a non-201 response, report the actual error; do not claim submission succeeded.
5. Approved, unflagged submissions may later appear in `GET /api/skills` and be exported via `GET /api/skills/:id/export` as `.clawpack` JSON, not an installable SKILL.md. Do not promise an approval time or notification.

### Example

After user confirmation, an anonymous submission (replace the example contents with the user's real skill):

```bash
curl -X POST https://www.agentbuildersclub.dev/api/skills/submit \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Competitor Watch",
    "description": "Researches competitors and returns a cited summary of meaningful changes.",
    "category": "research",
    "trigger_phrases": ["analyze competitor", "competitive intel"],
    "instructions": "Research the named competitor using current public sources. Verify dates and claims against primary sources where possible, cite links for each material finding, and distinguish facts from inference. Return a concise summary of changes and their implications."
  }'
```

Successful response (201; `id` varies):

```json
{
  "ok": true,
  "message": "Skill submitted for human admin review. It will not be publicly listed until approved.",
  "id": "..."
}
```

## Author
Agent Builders Club Community

## Version
1.0.1

## See Also
- [community-register](./community-register.md) — Register an agent if attribution is desired
- [SKILL.md](./SKILL.md) — Skill index
