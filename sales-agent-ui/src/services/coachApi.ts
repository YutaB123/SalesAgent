import type { Card, CoachResult, CoachRole, PostCallResponse, ServerStatus } from "../types/coach";

// Thin client for the Node server at the repo root (same origin; in `pnpm dev` Vite proxies /api there).

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
  return data as T;
}

/** What the server can do right now. Offline server = everything false, and the app falls back to the demo. */
export async function fetchStatus(): Promise<ServerStatus> {
  try { return await json<ServerStatus>(await fetch("/api/status")); } catch { return { claude: false, deepgram: false }; }
}

/** The coaching cards (the same cards.js the server uses). */
export async function fetchCards(): Promise<Card[]> {
  return (await json<{ cards: Card[] }>(await fetch("/api/cards"))).cards;
}

/** Ask Claude which card fits a line. Leave `speaker` undefined and Claude works out who is talking. */
export async function askCoach(text: string, speaker: CoachRole | undefined, history: string[], partial = false, customerId = ""): Promise<CoachResult> {
  // partial = the customer is still mid-sentence: the server may answer "no card yet". A finished line always gets a card.
  return json<CoachResult>(await fetch("/api/match", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ text, speaker, history: history.slice(-10), partial, customerId }),
  }));
}

/** Short-lived Deepgram token for the browser websocket handshake. The long-lived key stays on the server. */
export async function fetchDeepgramToken(): Promise<string> {
  const { token } = await json<{ token: string }>(await fetch("/api/dg-token", { cache: "no-store" }));
  if (!token) throw new Error("Deepgram is not configured on the server");
  return token;
}

/** Post-call report (Eva's call_analysis.py, run with Claude). Takes a few seconds. */
export async function requestPostCall(
  lines: { speaker: CoachRole; text: string }[],
  needs?: unknown,
  customer?: { name?: string; contact?: string; confirmedChannel?: string; recommendedChannel?: string }
): Promise<PostCallResponse> {
  return json<PostCallResponse>(await fetch("/api/post-call", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines, needs, customer }),
  }));
}
