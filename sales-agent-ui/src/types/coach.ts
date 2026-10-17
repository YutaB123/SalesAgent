// Shapes shared by the live coach (cards, Claude answers, post-call report).
// The cards themselves come from the server (/api/cards, defined in /cards.js at the repo root).

/** "rep" is the salesperson. The older React types call the same person "seller"; see toTurnSpeaker. */
export type CoachRole = "rep" | "customer";

export interface Card {
  id: string;
  kind?: "question" | "keepgoing";   // question = they ASKED something (green); keepgoing = no objection (blue)
  title: string;
  keys: string[];             // phrases that show the card instantly
  meaning: string;
  agree: string;              // step 1: what to say
  points: string[];           // step 2: what to explain
  ask: string;                // step 3: what to ask
  stop?: boolean;             // hard stop, red card
}

/** The words on a card. Claude can rewrite these to fit what the customer actually said. */
export interface CardContent { agree: string; points: string[]; ask: string; }

export interface ShownCard { card: Card; content: CardContent; tailored: boolean; }

/** Reply from POST /api/match. */
export interface CoachResult { speaker: CoachRole; card: string; agree: string; points: string[]; ask: string; }

export interface Evidence { turn_id: number; quote: string; }
export interface PostCallReport {
  summary: { text: string; evidence: Evidence[] };
  customer_needs: { text: string; evidence: Evidence[] }[];
  concerns: { category: string; text: string; evidence: Evidence[] }[];
  purchase_stage: { label: string | null; reason: string; evidence: Evidence[] } | null;
  call_outcome: { text: string; evidence: Evidence[] } | null;
  follow_up_actions: { action: string; owner: string; kind: string; channel: string; time_text: string | null; evidence: Evidence[] }[];
  communication_scores: { criterion: string; score: number | null; reason: string; evidence: Evidence[] }[];
  scoring: { overall_score: number | null; observed_criteria: number; total_criteria: number; note: string };
  schema_version: string;
}

export interface ServerStatus { claude: boolean; deepgram: boolean; model?: string; }
