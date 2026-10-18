// The safety check every coaching card passes before a rep sees it.
//
// A model can write a fluent card that contains an invented price or a promise nobody authorised. This check looks at
// the numbers and claims on a card and rejects it when they cannot be traced to something real. A rejected card is
// replaced by the card's built-in wording (which contains no figures), so the rep still gets help.
//
// It catches made-up figures and banned promises. It cannot judge whether advice is wise.
const UNIT_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS_WORDS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Dates and "N days ago" notes in the product data are not prices; leave them out of the numbers we trust. */
const withoutDates = (text) => String(text).replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ").replace(/\(\d+ days ago[^)]*\)/g, " ");

/** Numbers written as digits ("$65", "1,200", "2.5"). */
function digitNumbers(text) {
  return [...withoutDates(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => Number(m[0].replace(/,/g, ""))).filter(n => Number.isFinite(n));
}

/** Numbers spoken in words ("sixty five", "a hundred and fifty", "four hundred"). Punctuation ends a number. */
function wordNumbers(text) {
  const out = [];
  for (const clause of String(text).toLowerCase().replace(/-/g, " ").split(/[,.;:!?()\n$]/)) {
    let cur = null;
    const flush = () => { if (cur !== null) out.push(cur); cur = null; };
    for (const t of clause.split(/[^a-z0-9]+/)) {
      if (t in UNIT_WORDS) cur = (cur ?? 0) + UNIT_WORDS[t];
      else if (t in TENS_WORDS) cur = (cur ?? 0) + TENS_WORDS[t];
      else if (t === "hundred") cur = (cur === null || cur === 0 ? 1 : cur) * 100;
      else if (t === "thousand") cur = (cur === null || cur === 0 ? 1 : cur) * 1000;
      else if (t === "and" && cur !== null) continue;
      else flush();
    }
    flush();
  }
  return out;
}

const BANNED_CLAIMS = /\bit (only )?takes\b[^.]{0,30}\b(minutes?|seconds?|hours?)\b|\b(guarantee[sd]?|risk[- ]free|cheapest|lowest price|best price|you will save|you'll save|bill will (drop|go down)|cut your bill)\b/i;

/**
 * A card may only use a number over 12 that came from the customer's words, the handset catalog,
 * or that is plain arithmetic on two of those (a sum, a difference) or a per-line multiple (x2 ... x12).
 * Anything else is an invented figure. Returns null when the card is fine, or the reason it was rejected.
 */
function cardProblem(card, sourceText) {
  const text = [card.agree, ...(card.points || []), card.ask].join(" ");
  if (BANNED_CLAIMS.test(text)) return "promise we cannot make";
  const base = [...new Set([...digitNumbers(sourceText), ...wordNumbers(sourceText)])].filter(n => n > 12 && n < 100000).slice(0, 80);
  const allowed = new Set(base);
  for (const x of base) {
    for (let n = 2; n <= 12; n++) allowed.add(x * n);
    for (const y of base) { allowed.add(x + y); allowed.add(Math.abs(x - y)); }
  }
  const used = [...digitNumbers(text), ...wordNumbers(text)].filter(n => n > 12);
  const invented = used.filter(n => ![...allowed].some(x => Math.abs(x - n) < 0.51));
  return invented.length ? `number not from the call or product data: ${invented.join(", ")}` : null;
}

module.exports = { cardProblem, digitNumbers, wordNumbers };
