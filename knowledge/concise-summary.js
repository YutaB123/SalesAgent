function conciseSummary(value){
 const text=String(value||'').split('T-Mobile opportunity:')[0].replace(/\s+/g,' ').trim();
 const sentences=text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0,3).join(' ');
 const words=sentences.split(/\s+/);return words.length>60?words.slice(0,60).join(' ')+'…':sentences;
}
module.exports={conciseSummary};
