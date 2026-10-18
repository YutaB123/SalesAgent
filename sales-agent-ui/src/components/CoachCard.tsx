import type { ShownCard } from "../types/coach";
export function CoachCard({shown}:{shown:ShownCard;customerText?:string}) {
 const {card,content}=shown;
 const text=card.stop?content.agree:(content.ask||content.points[0]||content.agree);
 const sentence=Array.from(new Intl.Segmenter("en",{granularity:"sentence"}).segment(text))[0]?.segment.trim()||text;
 return <section className={`focus-script ${card.stop?"stop":""}`} aria-live="polite"><span>{card.stop?"STOP":"SAY THIS"}</span><p>{sentence}</p></section>;
}
