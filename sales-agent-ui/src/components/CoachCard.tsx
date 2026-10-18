import { HighlightedText } from "./HighlightedText";
import { importantPhrases } from "../utils/customerSignals";
import type { ReactNode } from "react";
import type { ShownCard } from "../types/coach";

function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return <div className="coach-step"><span className="coach-step-n">{n}</span><div><div className="coach-step-label">{label}</div>{children}</div></div>;
}

/**
 * The live coaching card, built for a brand new rep in the middle of a call: three numbered steps of plain words.
 * Purple = an objection, green = the customer asked a question, red = hard stop (do not push).
 */
export function CoachCard({ shown, customerText="" }: { shown: ShownCard; customerText?:string }) {
  const { card, content } = shown;
  const highlights=importantPhrases(customerText);
  const question = card.kind === "question";
  return (
    <section className={`coach-card${card.stop ? " stop" : question ? " question" : card.kind === "keepgoing" ? " keepgoing" : ""}`} aria-live="polite">
      <div className="coach-tag">
        {card.stop ? "STOP · " : question ? "Customer asked · " : ""}{card.title}
        {shown.tailored && <span className="coach-tailored">fitted to this call</span>}
      </div>
      {customerText&&<div className="customer-evidence"><span className="eyebrow">CUSTOMER SIGNAL</span><p><HighlightedText text={customerText}/></p>{!!highlights.length&&<div className="signal-tags">{highlights.map(x=><span key={x}>{x}</span>)}</div>}</div>}
      <Step n={1} label={card.stop ? "Say" : question ? "First, answer" : "First, say"}>
        <p className="coach-say">“<HighlightedText text={content.agree}/>”</p>
      </Step>
      <Step n={2} label={card.stop ? "Then" : question ? "Then add" : "Then explain"}>
        <ul className="coach-points">{content.points.map((p) => <li key={p}><HighlightedText text={p}/></li>)}</ul>
      </Step>
      {content.ask && <Step n={3} label="Next step"><p className="coach-ask"><HighlightedText text={content.ask}/></p></Step>}
    </section>
  );
}
