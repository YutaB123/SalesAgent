// The live coach: turns audio into transcript lines, and lines into coaching cards.
// Ported from the original single-page app (index.html at the repo root). Two ways to feed it audio:
//   startMic()           one microphone near a speakerphone; Deepgram tells the two voices apart (first voice = rep)
//   attachTrack(role,t)  an audio track whose speaker is already known (Photon phone call: rep track + customer track)
import { askCoach, fetchDeepgramKey } from "./coachApi";
import { DeepgramSession, type DgMessage, type DgWord } from "./deepgramSession";
import type { Card, CardContent, CoachResult, CoachRole, ShownCard } from "../types/coach";

export interface LiveCoachHooks {
  /** Words still being spoken (null = nothing in progress). */
  onLive(live: { role: CoachRole; text: string } | null): void;
  /** A finished line of the conversation. */
  onTurn(turn: { role: CoachRole; text: string }): void;
  /** The card to show. It stays up until a newer one replaces it. */
  onCard(shown: ShownCard): void;
  onError(message: string): void;
}

/** What we know about the sentence being spoken right now. */
interface Utterance { cardId: string | null; out: CoachResult | null; outWords: number; busy: boolean; lastLen: number; calls: number; }
const freshUtterance = (): Utterance => ({ cardId: null, out: null, outWords: 0, busy: false, lastLen: 0, calls: 0 });

/** One audio stream's running state. */
interface StreamState { segWords: DgWord[]; utt: Utterance; fixedRole?: CoachRole; }

const wordCount = (text: string) => text.trim().split(/\s+/).length;
const wordText = (w: DgWord) => w.punctuated_word || w.word;
const contentOf = (card: Card): CardContent => ({ agree: card.agree, points: card.points, ask: card.ask });

/** Claude's rewritten card text, or null if it didn't send any. */
function toContent(out: CoachResult): CardContent | null {
  return out.agree && out.points?.length ? { agree: out.agree, points: out.points.slice(0, 2), ask: out.ask || "" } : null;
}

/** Instant keyword match. Longer phrases win; the hard-stop card always wins. */
export function matchKeywords(cards: Card[], text: string): Card | null {
  const q = text.toLowerCase().replace(/[’]/g, "'");
  let best: Card | null = null, bestScore = 0;
  for (const card of cards) {
    const hit = card.keys.filter((k) => q.includes(k)).reduce((n, k) => n + k.length, 0);
    const score = hit * (card.stop ? 10 : 1);
    if (score > bestScore) { best = card; bestScore = score; }
  }
  return best;
}

export class LiveCoach {
  private history: string[] = [];
  private shown: ShownCard | null = null;
  private sessions: DeepgramSession[] = [];
  private states: StreamState[] = [];
  private ownedStreams: MediaStream[] = [];
  private spkMap: Record<number, CoachRole> = {};
  private swapped = false;
  private lastCommitted: CoachRole | null = null;

  constructor(private cards: Card[], private hooks: LiveCoachHooks, private useClaude: boolean) {}

  /** One microphone, two voices. */
  async startMic(): Promise<void> {
    const key = await fetchDeepgramKey();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    this.ownedStreams.push(stream);
    await this.open(key, stream, true);
  }

  /** An audio track from the phone call, where we already know who is talking. */
  async attachTrack(role: CoachRole, track: MediaStreamTrack): Promise<void> {
    await this.open(await fetchDeepgramKey(), new MediaStream([track]), false, role);
  }

  private async open(key: string, stream: MediaStream, diarize: boolean, fixedRole?: CoachRole): Promise<void> {
    const state: StreamState = { segWords: [], utt: freshUtterance(), fixedRole };
    const session = new DeepgramSession({
      key, stream, diarize,
      onMessage: (m) => this.onDeepgram(m, state),
      onError: (message) => this.hooks.onError(message),
      onClose: () => this.hooks.onError("Lost the connection to Deepgram."),
    });
    await session.start();
    this.sessions.push(session);
    this.states.push(state);
  }

  stop(): void {
    this.states.forEach((s) => this.flush(s));
    this.sessions.forEach((s) => s.stop());
    this.ownedStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.sessions = []; this.states = []; this.ownedStreams = [];
    this.hooks.onLive(null);
  }

  /** Rep and customer were the wrong way round. */
  swapRoles(): void { this.swapped = !this.swapped; }

  /** A line typed by hand (demo / no microphone). */
  typed(role: CoachRole, text: string): void {
    this.hooks.onTurn({ role, text });
    void this.processFinal(role, text);
  }

  // ---- roles ----
  private roleFor(speakerId: number): CoachRole {
    if (!(speakerId in this.spkMap)) this.spkMap[speakerId] = Object.keys(this.spkMap).length === 0 ? "rep" : "customer";
    const role = this.spkMap[speakerId];
    return this.swapped ? (role === "rep" ? "customer" : "rep") : role;
  }
  /** Interim words carry unreliable speaker ids, so guess that the other person is talking now. */
  private guessRole(): CoachRole { return this.lastCommitted === "rep" ? "customer" : this.lastCommitted === "customer" ? "rep" : "rep"; }

  // ---- Deepgram messages ----
  private onDeepgram(m: DgMessage, st: StreamState): void {
    if (m.type === "UtteranceEnd") return this.flush(st);
    if (m.type !== "Results") return;
    const alt = m.channel?.alternatives?.[0];
    const text = (alt?.transcript ?? "").trim();
    if (text) {
      const words = alt?.words ?? [];
      const lastWord = words[words.length - 1];
      const role: CoachRole = st.fixedRole
        ?? (m.is_final && lastWord ? this.roleFor(lastWord.speaker ?? 0)
          : st.segWords.length ? this.roleFor(st.segWords[st.segWords.length - 1].speaker ?? 0)
          : this.guessRole());
      let live: string;
      if (m.is_final) { st.segWords.push(...words); live = st.segWords.map(wordText).join(" "); }
      else live = [...st.segWords.map(wordText), text].join(" ");
      this.hooks.onLive({ role, text: live });
      this.onInterim(role, live, st.utt);
    }
    if (m.is_final && m.speech_final) this.flush(st);
  }

  /** The sentence is still being spoken: get a card up before they finish. */
  private onInterim(role: CoachRole, text: string, utt: Utterance): void {
    if (role === "rep") return;
    // A keyword card goes up instantly (generic wording)...
    const keyword = matchKeywords(this.cards, text);
    if (keyword) {
      if (this.shown?.card.id !== keyword.id) this.show(keyword, contentOf(keyword), false);
      utt.cardId = keyword.id;
      if (keyword.stop) return;   // a hard no needs no tailoring
    }
    // ...and Claude starts writing the real card from their words while they are still talking.
    if (!this.useClaude || utt.busy || utt.calls >= 3) return;
    const n = wordCount(text);
    if (n < 4 || n < utt.lastLen + 3) return;
    utt.busy = true; utt.lastLen = n; utt.calls += 1;
    askCoach(text, undefined, this.history)   // Claude also checks it's the customer talking
      .then((out) => {
        utt.out = out; utt.outWords = n;
        const card = this.cards.find((c) => c.id === out.card);
        if (card && out.speaker === "customer") {
          utt.cardId = card.id;
          const content = toContent(out);
          this.show(card, content ?? contentOf(card), !!content);
        }
      })
      .catch(() => { /* the keyword card (if any) is enough */ })
      .finally(() => { utt.busy = false; });
  }

  /** The speaker paused: turn the words so far into finished lines (one per speaker). */
  private flush(st: StreamState): void {
    const words = st.segWords; st.segWords = [];
    const utt = st.utt; st.utt = freshUtterance();
    this.hooks.onLive(null);
    if (!words.length) return;
    const runs: { role: CoachRole; text: string }[] = [];
    for (const w of words) {
      const role = st.fixedRole ?? this.roleFor(w.speaker ?? 0);
      const last = runs[runs.length - 1];
      if (last && last.role === role) last.text += " " + wordText(w); else runs.push({ role, text: wordText(w) });
    }
    this.lastCommitted = runs[runs.length - 1].role;
    runs.forEach((run, i) => { this.hooks.onTurn(run); void this.processFinal(run.role, run.text, i === 0 ? utt : undefined); });
  }

  /** A finished line: settle the card (keyword first for speed, then Claude's verdict). */
  private async processFinal(role: CoachRole, text: string, utt?: Utterance): Promise<void> {
    if (role === "rep") { this.history.push("Rep: " + text); return; }
    const local = matchKeywords(this.cards, text);
    if (local && this.shown?.card.id !== local.id) this.show(local, contentOf(local), false);
    if (local?.stop) { this.history.push("Customer: " + text); return; }   // a hard no never waits on the network

    let out: CoachResult | null = null;
    if (this.useClaude) {
      try {
        // Claude may already have answered while they were still talking: reuse it if the line barely grew.
        out = utt?.out && wordCount(text) <= utt.outWords + 2 ? utt.out : await askCoach(text, role, this.history);
      } catch { out = null; }
    }
    this.history.push("Customer: " + text);
    if (!out) return;
    const card = this.cards.find((c) => c.id === out.card);
    if (!card) return;   // Claude saw no objection or question: keep whatever card is showing
    const content = toContent(out);
    if (this.shown?.card.id !== card.id) this.show(card, content ?? contentOf(card), !!content);
    else if (content) this.show(card, content, true);
  }

  private show(card: Card, content: CardContent, tailored: boolean): void {
    this.shown = { card, content, tailored };
    this.hooks.onCard(this.shown);
  }
}
