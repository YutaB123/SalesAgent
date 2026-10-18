import { importantPhrases } from "../utils/customerSignals";
export function HighlightedText({text}:{text:string}){
 const phrases=importantPhrases(text).sort((a,b)=>b.length-a.length);
 if(!phrases.length)return <>{text}</>;
 const escaped=phrases.map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const pattern=new RegExp('('+escaped.join('|')+')','gi');
 return <>{text.split(pattern).map((part,i)=>phrases.some(p=>p.toLowerCase()===part.toLowerCase())?<mark key={i}>{part}</mark>:part)}</>;
}
