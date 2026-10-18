import type { TrackedCustomer } from "../types/salesAgent";
import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from "lucide-react";
import type { CoachRole } from "../types/coach";

// Dial the customer through Photon / LiveKit (Zoe's communications module, /communications/*).
// The module gives us a separate audio track for the rep and for the customer, so each can be
// transcribed on its own and the speaker labels are exact.

interface Comms extends EventTarget {
  connect(): Promise<void>;
  dial(recipient: string): Promise<{ callId: string }>;
  hangup(): Promise<void>;
  disconnect(): Promise<void>;
  mute(muted: boolean): Promise<void>;
  enableSound(): Promise<void>;
}
declare global { interface Window { SalesAgentCommunications?: new () => Comms; } }

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src; script.onload = () => resolve(); script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

type Phase = "idle" | "checking" | "unavailable" | "ready" | "connected";

export function PhoneCallPanel({ onAudioTrack, onCallEnded, onBeforeDial, onLookupCustomer }: {
  onBeforeDial: (phone: string) => Promise<TrackedCustomer>;
  onLookupCustomer: (phone: string) => Promise<TrackedCustomer | undefined>;
  onAudioTrack: (role: CoachRole, track: MediaStreamTrack) => void;
  onCallEnded: () => void;
}) {
  const commsRef = useRef<Comms | null>(null);
  const held = useRef<Partial<Record<CoachRole, MediaStreamTrack>>>({});   // audio we have but are not transcribing yet
  const answered = useRef(false);                                          // true while an answered call is in progress
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [number, setNumber] = useState("");
  const [preview,setPreview]=useState<TrackedCustomer|null>(null);
  const [lookupState,setLookupState]=useState("");
  const [preparing,setPreparing]=useState(false);
  const lookupRef=useRef(onLookupCustomer);lookupRef.current=onLookupCustomer;
  useEffect(()=>{setPreview(null);if(number.replace(/\D/g,"").length<8){setLookupState("");return;}let cancelled=false;setLookupState("Looking up customer history…");const timer=setTimeout(()=>{void lookupRef.current(number).then(c=>{if(!cancelled){setPreview(c??null);setLookupState(c?"Previous conversations found":"New phone contact · saved automatically when you call");}}).catch(()=>{if(!cancelled)setLookupState("Could not fetch customer history. Retry before calling.");});},450);return()=>{cancelled=true;clearTimeout(timer);};},[number]);
  const [callState, setCallState] = useState("idle");
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const active = !["idle", "ended", "failed"].includes(callState);
  // Reloading or closing this tab drops you out of the phone room, which hangs up on the customer. Ask first.
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
  const onTrack = useRef(onAudioTrack); onTrack.current = onAudioTrack;
  const onEnded = useRef(onCallEnded); onEnded.current = onCallEnded;

  // Check whether this server has phone calling set up, then load the browser module.
  useEffect(() => {
    if (!open || phase !== "idle") return;
    setPhase("checking");
    (async () => {
      try {
        const response = await fetch("/api/comms/state");
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Phone calling is not set up on this server.");
        await loadScript("/communications/sdk.js");
        await loadScript("/communications/browser.js");
        if (!window.SalesAgentCommunications) throw new Error("The phone module did not load.");
        const comms = new window.SalesAgentCommunications();
        comms.addEventListener("status", (e) => {
          const d = (e as CustomEvent).detail;
          setMessage(d.message);
          if (d.connected === false) { setPhase("ready"); setMessage("Your audio link dropped. Click Connect microphone to join again."); }   // do not leave dead buttons on screen
        });
        comms.addEventListener("error", (e) => setMessage((e as CustomEvent).detail.message));
        comms.addEventListener("playbackBlocked", () => setSoundBlocked(true));
        // Audio tracks show up while connecting and while ringing, but we only START listening once the customer answers.
        comms.addEventListener("audioTrack", (e) => {
          const d = (e as CustomEvent).detail;
          held.current[d.role as CoachRole] = d.track as MediaStreamTrack;
          if (answered.current) onTrack.current(d.role as CoachRole, d.track as MediaStreamTrack);   // answered already: start now
        });
        comms.addEventListener("state", (e) => {
          const next = (e as CustomEvent).detail?.call?.state ?? "idle";
          if (next === "answered" && !answered.current) {
            answered.current = true;   // the customer picked up: start transcribing both sides
            (["rep", "customer"] as CoachRole[]).forEach((role) => { const track = held.current[role]; if (track) onTrack.current(role, track); });
          }
          if (next === "ended" || next === "failed") { answered.current = false; delete held.current.customer; }   // keep the rep mic for the next call
          setCallState((previous) => { if (previous !== next && ["ended", "failed"].includes(next) && !["idle", "ended", "failed"].includes(previous)) onEnded.current(); return next; });
        });
        commsRef.current = comms;
        setPhase("ready"); setMessage("Connect your microphone, then enter the customer's number.");
      } catch (error) {
        setPhase("unavailable"); setMessage(error instanceof Error ? error.message : "Phone calling is unavailable.");
      }
    })();
  }, [open, phase]);

  useEffect(() => () => { void commsRef.current?.disconnect().catch(() => undefined); }, []);

  const run = (fn: () => Promise<void>) => async () => { try { await fn(); } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong."); } };
  const connect = run(async () => { await commsRef.current?.connect(); setPhase("connected"); });
  const dial = run(async () => { if (!window.confirm(`Call ${number}?`)) return;setPreparing(true);try {await onBeforeDial(number);setCallState("dialing");try{await commsRef.current?.dial(number);}catch(error){setCallState("failed");throw error;}}finally{setPreparing(false);} });
  useEffect(()=>{const end=()=>{if(active)void commsRef.current?.hangup().catch(e=>setMessage(String(e)));else onEnded.current();};window.addEventListener('end-conversation',end);return()=>window.removeEventListener('end-conversation',end);},[active]);
  const hangup = run(async () => { await commsRef.current?.hangup(); });
  const toggleMute = run(async () => { await commsRef.current?.mute(!muted); setMuted(!muted); });
  const enableSound = run(async () => { await commsRef.current?.enableSound(); setSoundBlocked(false); });

  return (
    <section className="phone-panel">
      <button className="phone-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><Phone size={15} />Start conversation / 拨电话</button>
      {open && <div className="phone-body"><label className="phone-customer-field">Customer phone number<input type="tel" disabled={active} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+1 425 555 0123" aria-label="Customer phone number" /></label>
        <div className="phone-preview"><strong>{preview?.name||"New customer"}</strong><span>Recommended plan · {preview?.recommendedPlan||preview?.productDiscussed||"To confirm"}</span><small>{lookupState}</small></div>
        {phase === "unavailable" && <p className="phone-note">{message} <br />Phone calling needs the Photon and LiveKit settings in <code>.env</code> and the communications service running (see <code>communications/README.md</code>). You can still use the microphone and speakerphone instead.</p>}
        {phase === "checking" && <p className="phone-note">Checking phone setup…</p>}
        {(phase === "ready" || phase === "connected") && <>
          <p className="phone-note">{message}</p>
          <div className="phone-row">
            {phase === "ready" && <button className="secondary-button" onClick={connect}><Mic size={14} />Connect microphone</button>}
            {phase === "connected" && <>

              <button className="primary-button" onClick={dial} disabled={!number.trim() || active || preparing}><Phone size={14} />Call</button>
              <button className="danger-light" onClick={hangup} disabled={!active}><PhoneOff size={14} />Hang up</button>
              <button className="secondary-button" onClick={toggleMute}>{muted ? <MicOff size={14} /> : <Mic size={14} />}{muted ? "Unmute" : "Mute"}</button>
              {soundBlocked && <button className="secondary-button" onClick={enableSound}><Volume2 size={14} />Enable call sound</button>}
            </>}
          </div>
          {phase === "connected" && <p className="phone-note">{callState === "dialing" ? <>Calling… the app starts listening <b>when the customer answers</b>.</> : callState === "answered" ? <>Customer answered. <b>Listening to both sides.</b></> : <>Ready to call. The app starts listening when the customer answers.</>} Use a headset so the customer's voice does not echo back.</p>}
        </>}
      </div>}
    </section>
  );
}
