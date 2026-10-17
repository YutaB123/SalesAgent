// One live connection to Deepgram for one audio stream. Raw 16 kHz PCM goes out in 50 ms pieces
// (no encoder or container delay); transcript messages come back through onMessage.

export interface DgWord { word: string; punctuated_word?: string; speaker?: number; }
export interface DgMessage {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: { transcript?: string; words?: DgWord[] }[] };
}

export interface DeepgramOptions {
  key: string;
  stream: MediaStream;
  /** true = one microphone with two voices: Deepgram labels the speakers. false = this stream is one known person. */
  diarize: boolean;
  onMessage: (message: DgMessage) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

const WORKLET = `class P extends AudioWorkletProcessor {
  constructor() { super(); this.b = []; this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) {
      this.b.push(new Float32Array(ch)); this.n += ch.length;
      if (this.n >= 800) {
        const out = new Int16Array(this.n); let o = 0;
        for (const a of this.b) for (let i = 0; i < a.length; i++) { const s = Math.max(-1, Math.min(1, a[i])); out[o++] = s < 0 ? s * 0x8000 : s * 0x7fff; }
        this.port.postMessage(out.buffer, [out.buffer]); this.b = []; this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm", P);`;

export class DeepgramSession {
  private ctx: AudioContext | null = null;
  private ws: WebSocket | null = null;
  private node: AudioWorkletNode | null = null;
  private stopped = false;

  constructor(private opts: DeepgramOptions) {}

  async start(): Promise<void> {
    const ctx = new AudioContext({ sampleRate: 16000 });
    this.ctx = ctx;
    // Browsers start an AudioContext paused when it is created outside a click (like a call-audio event). Wake it up.
    if (ctx.state === "suspended") await ctx.resume();
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(moduleUrl);
    URL.revokeObjectURL(moduleUrl);
    const params = new URLSearchParams({
      model: "nova-3", language: "en", punctuate: "true", smart_format: "true",
      encoding: "linear16", sample_rate: String(ctx.sampleRate), channels: "1",
      interim_results: "true", endpointing: "250", utterance_end_ms: "1000",
      diarize: String(this.opts.diarize),
    });
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["token", this.opts.key]);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Could not reach Deepgram. Check the key in .env."));
    });
    const source = ctx.createMediaStreamSource(this.opts.stream);
    this.node = new AudioWorkletNode(ctx, "pcm");
    this.node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => { if (ws.readyState === WebSocket.OPEN) ws.send(event.data); };
    source.connect(this.node);
    ws.onmessage = (event) => {
      try { this.opts.onMessage(JSON.parse(event.data as string) as DgMessage); }
      catch (error) { console.error("Deepgram message error", error); }
    };
    ws.onerror = () => this.opts.onError("Deepgram connection problem");
    ws.onclose = () => { if (!this.stopped) this.opts.onClose(); };
  }

  stop(): void {
    this.stopped = true;
    try { this.node?.disconnect(); void this.ctx?.close(); } catch { /* already closed */ }
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "CloseStream" }));
      this.ws?.close();
    } catch { /* already closed */ }
    this.node = null; this.ctx = null; this.ws = null;
  }
}
