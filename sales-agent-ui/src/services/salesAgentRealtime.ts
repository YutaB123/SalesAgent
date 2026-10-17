import { demoListeningTranscript } from "../data/mockData";
import type { ConversationTurn } from "../types/salesAgent";

/**
 * Frontend boundary for a future connection to the team's existing Python
 * recording/transcription pipeline. No endpoint or transport is assumed here.
 */
export interface SalesAgentRealtimeSource {
  readonly mode: "mock" | "live";
  start(onTranscript: (turn: ConversationTurn) => void): Promise<void>;
  stop(): Promise<void>;
}

/** Sample-only adapter used until the backend's actual interface is confirmed. */
export const mockRealtimeSource: SalesAgentRealtimeSource = {
  mode: "mock",
  async start(onTranscript) {
    demoListeningTranscript.forEach((turn) => onTranscript({ ...turn, source: "mock" }));
  },
  async stop() {},
};
