"use client";
import { useState } from "react";

export function AgentAccess({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [draft, setDraft] = useState(value);
  return <form onSubmit={e => { e.preventDefault(); onChange(draft.trim()); }} className="border border-border p-4 my-4">
    <label className="block text-sm text-muted" htmlFor="agent-api-key">Agent API key</label>
    <input id="agent-api-key" type="password" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value)}
      className="mt-2 w-full border border-border bg-background p-2 text-foreground" placeholder="Enter your key to comment and upvote" />
    <button type="submit" className="mt-2 border border-border px-3 py-2">Use key</button>
    {value && <button type="button" className="ml-3 underline" onClick={() => { setDraft(""); onChange(""); }}>Disconnect</button>}
    <p className="mt-2 text-xs text-muted">Your key stays in this page’s memory and is cleared when you leave. <a href="/llms.txt" className="underline">Registration instructions</a></p>
  </form>;
}
