import { resolveFollowUpDate } from "./callInsights";
import type { ConversationTurn, TrackedCustomer } from "../types/salesAgent";
const TOPICS: [string,RegExp][] = [
 ["Budget", /\$\s*\d[\d,.]*|\b(?:budget|paying|afford|expensive|cheaper|price)\b/i],
 ["Phone preferences", /\b(?:camera|battery|storage|screen|display|iphone|android|samsung|pixel|motorola|foldable|stylus)\b/i],
 ["Decision", /\b(?:wife|husband|partner|decid|interested|ready)\w*/i],
 ["Follow-up", /\b(?:call.*(?:tomorrow|later|week)|follow.?up|email|text me|busy)\b/i],
];
export function criticalInformation(turns: ConversationTurn[]): NonNullable<TrackedCustomer["criticalInformation"]> {
 const found: NonNullable<TrackedCustomer["criticalInformation"]> = [];
 for (const turn of turns.filter(t => t.speaker === "customer")) {
  for (const [kind,pattern] of TOPICS) if (pattern.test(turn.text) && !found.some(x => x.quote === turn.text)) found.push({kind,text:turn.text,quote:turn.text});
 }
 return found.slice(-12);
}
export function requestedNoContact(turns: ConversationTurn[]) { return turns.some(t => t.speaker === "customer" && /\b(?:do not call|don't call|stop calling|remove (?:me|my number)|do not contact|don't contact)\b/i.test(t.text)); }
export function importantPhrases(text: string): string[] {
 const phrases = [...text.matchAll(/\$\s*\d[\d,]*(?:\.\d{1,2})?|\b\d+\s*(?:GB|months?)\b|\b(?:tomorrow|next week|camera|battery|storage|budget|iPhone|Android|Samsung|Pixel|Motorola|T-Mobile)\b/gi)].map(x=>x[0]);
 return [...new Set(phrases)].slice(0,8);
}

export function suggestFollowUp(turns: ConversationTurn[], today=new Date()): TrackedCustomer["followUpRecommendation"] {
 if(requestedNoContact(turns))return undefined;
 const requested=[...turns].reverse().find(t=>t.speaker==="customer" && /\b(?:call|contact|follow.?up|talk)\b/i.test(t.text) && resolveFollowUpDate(t.text,today));
 if(requested)return {date:resolveFollowUpDate(requested.text,today)!,basis:"agreed",reason:"Customer requested: “"+requested.text+"”"};
 const date=new Date(today);date.setDate(date.getDate()+3);while(date.getDay()===0||date.getDay()===6)date.setDate(date.getDate()+1);
 return {date:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`,basis:"suggested",reason:"Suggested check-in after this conversation; no appointment was agreed. Review unresolved needs first."};
}
