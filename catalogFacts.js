// What the coaching agent knows about plans: the verified carrier catalog (knowledge/, owned by Zoe).
//
// The catalog lives in Supabase PostgreSQL when SUPABASE_DB_URL is set, otherwise in database/carrier_plans.sqlite
// (see knowledge/README.md). It is read through knowledge/api.js, so edits made in the Plan Database page reach the
// agent within CACHE_MS. If the database cannot be read, the bundled snapshot (knowledge/carrier-plans.json) is used
// so a card is never blocked by a database problem.
//
// This module does two jobs:
//   catalogSheet()          a COMPACT text version of the catalog for the model (the raw catalog is ~5,000 words)
//   planFacts(text, hist)   when the customer is comparing, the verified comparison computed by knowledge/comparison.js
const { operation: planOperation } = require("./knowledge/api");
const { compare, snapshot, canonicalCarrier } = require("./knowledge/comparison");

const CACHE_MS = 15 * 1000;
let cache = { at: 0, catalog: null, sheet: "" };

const money = (cents) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
const ageDays = (iso) => Math.floor((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86400000);

/** The catalog, never throws. */
async function getCatalog() {
  if (cache.catalog && Date.now() - cache.at < CACHE_MS) return cache.catalog;
  let catalog;
  try {
    catalog = await planOperation("list");
  } catch (error) {
    console.warn(`plan catalog unavailable (${error.message}); using the bundled snapshot`);
    catalog = { ...snapshot, storage: "bundled snapshot", revisions: {}, updates: [] };
  }
  cache = { at: Date.now(), catalog, sheet: "" };
  return catalog;
}

function featureText(plan, limit = 6) {
  const f = plan.features || [];
  return f.slice(0, limit).join("; ") + (f.length > limit ? `; and ${f.length - limit} more in the catalog` : "");
}

function stamp(plan, maxAge) {
  const age = ageDays(plan.verifiedOn);
  const old = !Number.isFinite(age) || age > maxAge;
  return `verified ${plan.verifiedOn}${Number.isFinite(age) ? ` (${age} days ago)` : ""}${old ? `, OLD: say "as of ${plan.verifiedOn}" and offer to re-verify` : ""}; source ${plan.sourceUrl}`;
}

function describePlan(plan, maxAge) {
  const parts = [];
  const table = Object.entries(plan.baseMonthlyCentsByLines || {}).map(([n, c]) => `${n} line${n === "1" ? "" : "s"} ${money(c)}`).join(", ");
  if (table) parts.push(`standard price per month: ${table} (${plan.priceBasis || "before taxes and fees"})`);
  if (plan.advertisedOffer) {
    const o = plan.advertisedOffer;
    parts.push(`ADVERTISED offer, not what any customer pays: ${money(o.perLineCents)} per line for ${o.lines} line${o.lines === 1 ? "" : "s"}; conditions: ${o.conditions}`);
  }
  if (plan.providerFeeCentsPerLine !== undefined) parts.push(`regulatory fee ${money(plan.providerFeeCentsPerLine)} per line, taxes extra`);
  if (plan.features?.length) parts.push(`includes: ${featureText(plan)}`);
  if (plan.eligibility) parts.push(`eligibility: ${plan.eligibility}`);
  if(plan.verificationMethod === 'automatic-source-extraction')parts.push('machine-extracted source evidence; confirm offer eligibility before a final quote');
  parts.push(stamp(plan, maxAge));
  return `- ${plan.carrier} ${plan.name}: ${parts.join("; ")}`;
}

/** The catalog as short text for the model's instructions. */
async function catalogSheet() {
  if(process.env.SALES_DATA_MODE !== "real"){const {plans}=await require("./knowledge/demo-api").demoOperation("plans");return "FICTIONAL DEMO ONLY. Sell these fictional plans, never represent them as real carrier offers. No discounts are authorized. " + JSON.stringify(plans);}
  const catalog = await getCatalog();
  if (cache.sheet) return cache.sheet;
  const maxAge = catalog.maxAgeDays ?? 14;
  const plans = catalog.plans || [];
  const general = plans.filter((p) => p.carrier === "T-Mobile" && !p.requiresEligibility);
  const special = plans.filter((p) => p.carrier === "T-Mobile" && p.requiresEligibility);
  const others = plans.filter((p) => p.carrier !== "T-Mobile");
  cache.sheet = [
    `OFFICIAL PLAN CATALOG (${catalog.market || "US consumer postpaid mobile"}; source-backed official carrier pages; automatic extractions are identified separately; prices in USD per month). We sell T-Mobile plans.`,
    "How to use it: standard prices exclude taxes, provider fees, devices and discounts. An advertised offer is NOT what any customer pays today. Never claim T-Mobile is cheaper or better overall. Never invent credits, payoffs, discounts, deadlines or promotions: if it is not in this catalog, say you will confirm it. If a record is OLD, say \"as of <date>\" and offer to re-verify.",
    "",
    "T-MOBILE PLANS (general consumer plans):",
    ...general.map((p) => describePlan(p, maxAge)),
    special.length ? `\nT-MOBILE SPECIALIZED PLANS (${[...new Set(special.map((p) => p.name))].join("; ")}): each needs verified eligibility. Never quote one without it.` : "",
    "",
    "OTHER CARRIERS (their ADVERTISED offers, not a customer's actual bill):",
    ...others.map((p) => describePlan(p, maxAge)),
  ].filter((l) => l !== "").join("\n");
  return cache.sheet;
}

/** Plan talk that deserves the verified comparison (a carrier named, or prices and offers discussed). */
const COMPARING = /\b(cheaper|cheap|less|more expensive|offered|better deal|compare|comparing|compared|other carrier|another carrier|competitor|switch(?:ed|ing)? (?:from|to)|per line|a line|\d+\s*(?:a|per)\s*(?:month|line)|why would i pay|at\s*(?:&|and)\s*t|verizon)\b|\$\s?\d/i;

/**
 * The verified comparison for this customer line, or "" when the line is not about comparing.
 * knowledge/comparison.js does the arithmetic and refuses to claim a difference until the customer has given a
 * comparable bill (line count, service-only charge, before taxes and fees), so the model never has to guess a number.
 */
async function planFacts(text, history = []) {
  if(process.env.SALES_DATA_MODE !== "real")return catalogSheet();
  const lower = String(text);
  if (!COMPARING.test(lower) && !canonicalCarrier(lower)) return "";
  const catalog = await getCatalog();
  let result;
  try { result = compare(catalog, { text: lower, history, customer: {}, targetPlanId: "tmobile-essentials-2" }); }
  catch (error) { return `VERIFIED COMPARISON unavailable (${error.message}). Do not state any price difference; ask the customer for the details you need.`; }

  const c = result.customer;
  const who = [c.carrier, c.planName].filter(Boolean).join(" ") || "not stated yet";
  const lines = [
    "VERIFIED COMPARISON (computed by code from the catalog; use these numbers exactly and do NO other price arithmetic):",
    `- What the customer has said about their bill so far: carrier/plan: ${who}; lines: ${c.lineCount ?? "not stated"}; amount: ${c.monthlyCents ? `${money(c.monthlyCents)} ${c.amountBasis === "per_line" ? "per line" : c.amountBasis === "account_total" ? "for the account" : "(per line or account not stated)"}` : "not stated"}; before taxes and fees: ${c.taxBasis === "excluded" ? "yes" : "not confirmed"}.`,
    `- Compared against: ${result.target.carrier} ${result.target.name}${result.targetBaseMonthlyCents !== null ? `, ${c.lineCount} line(s): ${money(result.targetBaseMonthlyCents)} per month standard price before taxes and fees` : ""}; ${stamp(result.target, catalog.maxAgeDays ?? 14)}.`,
  ];
  if (result.status === "stale") lines.push("- STATUS: the saved prices are OLD. Do not state a difference. Say you will verify the current price first.");
  else if (result.status === "needs_details") lines.push(`- STATUS: not enough to compare yet. Do NOT state any price difference or saving. Recommend a relevant verified benefit now; request only the one missing detail necessary if they ask for an exact comparison. Missing facts: ${result.questions.slice(0, 3).join(" ")}`);
  else {
    const d = result.baseServiceDifferenceCents;
    lines.push(`- STATUS: usable. ${d > 0 ? `The T-Mobile standard service price is ${money(d)} per month LOWER than the customer's stated service charge` : d < 0 ? `The T-Mobile standard service price is ${money(-d)} per month HIGHER than the customer's stated service charge` : "The standard service prices are the same"}. Say which way it goes, honestly, and say this is not total-bill savings (fees, device balances and benefits still need review).`);
  }
  if (result.competitors.length) lines.push(`- Plans of the carrier the customer named (advertised offers, not their bill): ${result.competitors.map((p) => `${p.name}${p.advertisedOffer ? ` ${money(p.advertisedOffer.perLineCents)} per line for ${p.advertisedOffer.lines} line(s), with conditions` : ""}`).join("; ")}.`);
  else if (canonicalCarrier(lower) && canonicalCarrier(lower) !== "T-Mobile") lines.push("- The customer named a carrier that has no plan in the catalog. Say you will confirm its details; do not guess.");
  return lines.join("\n");
}

/** For /api/status and the Plan Database page. */
async function status() {
  if(process.env.SALES_DATA_MODE !== "real")return {storage:"demo-sqlite",count:3,fictional:true};
  const catalog = await getCatalog();
  const dates = (catalog.plans || []).map((p) => p.verifiedOn).filter(Boolean).sort();
  const oldest = dates[0] || null;
  return { storage: catalog.storage, count: (catalog.plans || []).length, oldest_verified: oldest, stale: oldest ? ageDays(oldest) > (catalog.maxAgeDays ?? 14) : true };
}

function invalidate(){cache={at:0,catalog:null,sheet:""};}
module.exports = { invalidate, getCatalog, catalogSheet, planFacts, status };
