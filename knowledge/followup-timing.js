const ZONE='America/Los_Angeles';
function parts(date){return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
function wall(y,m,d,h,min){let ms=Date.UTC(y,m-1,d,h,min);for(let i=0;i<3;i++){const p=parts(new Date(ms));const rendered=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);ms+=Date.UTC(y,m-1,d,h,min)-rendered;}return new Date(ms);}
function suggestTiming({lines=[],now=new Date(),callDate}={}){
 now=new Date(now);const anchor=new Date(callDate||now);const p=parts(anchor);
 const customer=lines.filter(l=>l.speaker==='customer');
 for(const l of [...customer].reverse()){
  const text=l.text||'';if(!/text|message|follow.?up|reach out|contact|send|短信|联系/i.test(text))continue;
  const unresolved=reason=>({scheduledAt:'',timeZone:ZONE,basis:'suggested',reason:`Confirm the exact follow-up time before scheduling. ${reason} Customer said: “${text}”`,evidence:text});
  if(/\b(?:EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|UTC|GMT|eastern|central|mountain)\b/i.test(text))return unresolved('A different timezone was mentioned.');
  const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fifteen:15,thirty:30};
  let date;const relative=text.match(/\b(?:in|after) (\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty) (minutes?|hours?|days?)\b/i);
  if(relative)date=new Date(+anchor+(Number(relative[1])||words[relative[1].toLowerCase()])*(/minute/i.test(relative[2])?60000:/hour/i.test(relative[2])?3600000:86400000));
  const exact=text.match(/\b(today|tomorrow|(?:next )?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if(exact){const h=+exact[2],min=+(exact[3]||0);if(h>=1&&h<=12&&min<60){const dayName=exact[1].toLowerCase();let delta=dayName==='tomorrow'?1:0;
   if(!['today','tomorrow'].includes(dayName)){const weekdays=['sun','mon','tue','wed','thu','fri','sat'];delta=(weekdays.indexOf(dayName.replace('next ','').slice(0,3))-weekdays.indexOf(p.weekday.toLowerCase())+7)%7;if(delta===0||dayName.startsWith('next '))delta=delta||7;}
   const day=new Date(Date.UTC(+p.year,+p.month-1,+p.day+delta));date=wall(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate(),h%12+(/pm/i.test(exact[4])?12:0),min);}}
  if(date&&date>now&&date-now<=30*86400000)return {scheduledAt:date.toISOString(),timeZone:ZONE,basis:'customer_requested',reason:`Customer requested: “${text}”`,evidence:text};
  if(date||/today|tomorrow|tonight|next week|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\bat \d|\bin \w+ (?:minutes?|hours?|days?)/i.test(text))return unresolved(date?'The mentioned time is already past or outside the scheduling window.':'The timing is ambiguous.');
 }
 let date=new Date(+now+2*3600000);let d=parts(date);
 if(+d.hour>=18){const next=new Date(Date.UTC(+d.year,+d.month-1,+d.day+1));date=wall(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate(),9,0);}
 else if(+d.hour<9)date=wall(+d.year,+d.month,+d.day,9,0);
 while(['Sat','Sun'].includes(parts(date).weekday)){d=parts(date);const next=new Date(Date.UTC(+d.year,+d.month-1,+d.day+1));date=wall(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate(),9,0);}
 return {scheduledAt:date.toISOString(),timeZone:ZONE,basis:'suggested',reason:'Suggested: about two hours after the call, moved into weekday 9am–6pm Pacific hours. Confirm any vague or different timing with the customer; this is not an agreed appointment.',evidence:null};
}
module.exports={suggestTiming};
