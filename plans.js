// Plan facts for the coaching agent: our plan and the other carriers' plans, so the agent can compare for real.
//
// Source of truth: the Supabase tables `carriers` and `carrier_plans` (supabase/migrations/20261018000000_carrier_plans.sql).
// It reads them with the PUBLISHABLE key (read-only, demo rows only) when SUPABASE_URL and the key are set.
// If Supabase is not configured or not reachable, it uses data/plans.demo.json, which holds the same rows,
// so the agent always works. /api/status tells you which source is live.
const fs = require("fs");
const path = require("path");

const LOCAL_FILE = path.join(__dirname, "data", "plans.demo.json");
const CACHE_MS = 60 * 1000;
const STALE_DAYS = 30;
let cache = { at: 0, rows: [], source: "none", error: null };

// ---------- loading ----------
function localRows() {
  const data = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  const carriers = Object.fromEntries(data.carriers.map((c) => [c.id, c]));
  return data.plans.filter((p) => p.active !== false).map((p) => ({ ...p, carrier: carriers[p.carrier_id] }));
}

async function supabaseRows() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const response = await fetch(`${url}/rest/v1/carrier_plans?select=*,carrier:carriers(*)&active=eq.true`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Supabase answered ${response.status} (has the carrier_plans migration been run?)`);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error("Supabase has no plan rows yet");
  return rows.filter((r) => r.carrier);
}

/** All active plans with their carrier attached. Cached for a minute. Never throws. */
async function getPlans() {
  if (Date.now() - cache.at < CACHE_MS && cache.rows.length) return cache;
  try {
    const remote = await supabaseRows();
    cache = remote ? { at: Date.now(), rows: remote, source: "supabase", error: null }
                   : { at: Date.now(), rows: localRows(), source: "local file", error: null };
  } catch (error) {
    cache = { at: Date.now(), rows: localRows(), source: "local file", error: error.message };
  }
  return cache;
}

async function status() {
  const { rows, source, error } = await getPlans();
  const verified = rows.map((r) => r.verified_on).sort();
  return { source, count: rows.length, oldest_verified: verified[0] || null, error };
}

// ---------- reading what the customer said ----------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text, words) => words.some((w) => new RegExp(`\\b${escapeRe(w)}\\b`).test(text));
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

function linesMentioned(text) {
  const m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight)\s+(?:phone\s+)?(?:lines?|phones?|people)\b/.exec(text);
  if (!m) return null;
  const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
  return n >= 1 && n <= 10 ? n : null;
}

const COMPARING = /\b(cheaper|cheap|less|more expensive|offered|better deal|compare|comparing|compared|other carrier|another carrier|competitor|switch(?:ed|ing)? (?:from|to)|per line|a line|\d+\s*(?:a|per)\s*(?:month|line)|why would i pay)\b|\$\s?\d/;

// ---------- describing plans ----------
const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;
const ageDays = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);
const unknown = (v) => v === null || v === undefined;

function describe(plan) {
  const price = plan.price_per_line != null
    ? `${money(plan.price_per_line)} per line per month`
    : `${money(plan.bundle_price)} total for ${plan.bundle_lines} lines${plan.promo_months ? ` for the first ${plan.promo_months} months, then ${money(plan.regular_price_per_line)} per line` : ""}`;
  const parts = [
    price,
    `data: ${plan.data_policy ?? "unknown"}`,
    `included: ${plan.includes?.length ? plan.includes.join("; ") : "nothing extra listed"}`,
    `price lock: ${unknown(plan.price_lock_years) ? "none listed" : `${plan.price_lock_years} year${plan.price_lock_years > 1 ? "s" : ""}`}`,
    `contract: ${unknown(plan.contract_months) ? "none listed" : `${plan.contract_months} months`}`,
    `taxes and fees included in that price: ${unknown(plan.taxes_fees_included) ? "unknown" : plan.taxes_fees_included ? "yes" : "no"}`,
    `hotspot: ${plan.hotspot_note ?? "unknown"}`,
  ];
  if (plan.promo_note) parts.push(`promotion: ${plan.promo_note}${plan.promo_ends ? ` (ends ${plan.promo_ends})` : ""}`);
  const age = ageDays(plan.verified_on);
  parts.push(`verified ${plan.verified_on} (${age} days ago${age > STALE_DAYS ? ", OLD: say \"as of " + plan.verified_on + "\" and offer to re-check" : ""})`);
  return `${plan.carrier.name}, ${plan.name}: ${parts.join("; ")}`;
}

/** Monthly cost of a plan for n lines. Returns text, or null when the plan does not fit that number of lines. */
function costForLines(plan, n) {
  if (plan.price_per_line != null) return `${money(plan.price_per_line * n)} a month`;
  if (plan.bundle_lines === n) {
    const intro = `${money(plan.bundle_price)} a month`;
    return plan.promo_months ? `${intro} for the first ${plan.promo_months} months, then ${money(plan.regular_price_per_line * n)} a month` : intro;
  }
  return null;
}

/**
 * The facts block for one customer line, or "" when the line is not about comparing.
 * It goes into the model's message so every competitor claim on a card comes from the database.
 */
async function planFacts(text, history = []) {
  const { rows } = await getPlans();
  const lower = String(text).toLowerCase();
  const recent = history.slice(-4).filter((h) => /^customer:/i.test(h)).join(" ").toLowerCase();
  const carriers = [...new Map(rows.map((r) => [r.carrier.id, r.carrier])).values()];
  const rivals = carriers.filter((c) => !c.is_us);
  const named = rivals.filter((c) => mentions(lower, [c.name.toLowerCase(), ...c.aliases]));
  const namedRecently = rivals.filter((c) => mentions(recent, [c.name.toLowerCase(), ...c.aliases]));
  if (!named.length && !COMPARING.test(lower)) return "";   // not a comparison: keep the model's job simple

  const ours = rows.filter((r) => r.carrier.is_us);
  const focus = named.length ? named : namedRecently.length ? namedRecently : rivals;
  const rivalPlans = rows.filter((r) => focus.some((c) => c.id === r.carrier.id));
  const n = linesMentioned(lower) ?? linesMentioned(recent);

  const out = [
    "PLANS DATABASE FACTS (fictional demo data). Use ONLY these for anything about another carrier. \"unknown\" means it is not in the database, so say you will confirm it.",
    `Carriers in the database: ${rivals.map((c) => c.name).join(", ")}. Any other carrier the customer names is NOT in the database.`,
    ...ours.map((p) => `OUR PLAN: ${describe(p)}`),
    ...rivalPlans.map((p) => `${named.length || namedRecently.length ? "CARRIER THE CUSTOMER NAMED" : "OTHER CARRIERS IN THE DATABASE (none of them was named. If the customer named a carrier that is not listed here, say you will confirm its details; if they named none, do not guess which one they mean)"}: ${describe(p)}`),
  ];
  if (n) {
    out.push(`THE CUSTOMER HAS ${n} LINE${n > 1 ? "S" : ""}. Monthly cost for ${n} line${n > 1 ? "s" : ""}, before any taxes and fees:`);
    [...ours, ...rivalPlans].forEach((p) => { const c = costForLines(p, n); if (c) out.push(`  ${p.carrier.name} ${p.name}: ${c}`); });
  }
  return out.join("\n");
}

module.exports = { getPlans, status, planFacts, _internal: { linesMentioned, costForLines, describe } };
