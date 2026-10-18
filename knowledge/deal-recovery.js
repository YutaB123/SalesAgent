const { recommend } = require("./recommendations");
const { calculateDealRisk } = require("./deal-risk");
const { getNextBestAction } = require("./next-best-action");
const { createFollowUp } = require("./follow-up");

const CUSTOMER_CUES = {
  consideringCompetitor: /\b(verizon|at\s*&\s*t|at&t|mint mobile|visible|another carrier|other carrier|another provider|other provider|competitor)\b/i,
  needsTimeToThink: /\b(think about it|need some time|need time|sleep on it|get back to you|not ready to decide|decide later|talk it over)\b/i
};

function firstConcern(report, category) {
  return (report.concerns || []).find((item) => item.category.toLowerCase() === category.toLowerCase());
}

function signalEvidence(report, lines, concern, cue) {
  const fromReport = (concern?.evidence || []).filter((item) => Number.isInteger(item.turn_id) && typeof item.quote === "string");
  if (fromReport.length) return fromReport;
  const result = [];
  lines.forEach((line, turn_id) => {
    if (line.speaker === "customer" && cue?.test(line.text)) result.push({ turn_id, quote: line.text });
  });
  return result;
}

function buildDealRecovery({ report, lines, needs = {}, customer = {} }) {
  const priceConcern = firstConcern(report, "Price");
  const competitor = signalEvidence(report, lines, null, CUSTOMER_CUES.consideringCompetitor);
  const timeToThink = signalEvidence(report, lines, null, CUSTOMER_CUES.needsTimeToThink);
  const stageEvidence = report.purchase_stage?.label === "Ready to buy" ? report.purchase_stage.evidence || [] : [];
  const promised = (report.follow_up_actions || []).find((item) => item.kind === "promised" && item.owner !== "unknown");
  const promisedEvidence = promised?.evidence || [];

  let recommendationOverBudgetEvidence = [];
  const budget = Number(needs.budgetTarget);
  if (needs.budgetTarget != null && Number.isFinite(budget)) {
    const unconstrained = recommend({ ...needs, budgetTarget: null });
    if (unconstrained.recommendations.length && unconstrained.recommendations.every((item) => item.monthlyTotal > budget)) {
      recommendationOverBudgetEvidence = priceConcern?.evidence || [];
    }
  }

  const signals = {
    priceObjection: Boolean(priceConcern?.evidence?.length),
    consideringCompetitor: competitor.length > 0,
    needsTimeToThink: timeToThink.length > 0,
    recommendationOverBudget: recommendationOverBudgetEvidence.length > 0,
    positiveBuyingIntent: stageEvidence.length > 0,
    agreedNextStep: promisedEvidence.length > 0
  };
  const evidenceBySignal = {
    priceObjection: signalEvidence(report, lines, priceConcern),
    consideringCompetitor: competitor,
    needsTimeToThink: timeToThink,
    recommendationOverBudget: recommendationOverBudgetEvidence,
    positiveBuyingIntent: stageEvidence,
    agreedNextStep: promisedEvidence
  };
  const labels = {
    priceObjection: ["price_objection", "high"],
    consideringCompetitor: ["considering_competitor", "high"],
    needsTimeToThink: ["needs_time_to_think", "medium"],
    recommendationOverBudget: ["recommendation_over_budget", "high"],
    positiveBuyingIntent: ["positive_buying_intent", "positive"],
    agreedNextStep: ["agreed_next_step", "positive"]
  };
  const riskSignals = Object.entries(signals)
    .filter(([key, value]) => value && evidenceBySignal[key].length)
    .map(([key]) => ({
      type: labels[key][0], severity: labels[key][1],
      evidence: evidenceBySignal[key][0].quote,
      turn_id: evidenceBySignal[key][0].turn_id
    }));

  const risk = calculateDealRisk(signals);
  const recommendedAction = getNextBestAction(signals);
  const missingInformation = [];
  if (needs.budgetTarget == null) missingInformation.push("Confirm the customer's total monthly budget.");
  if (needs.wantsNewPhone == null) missingInformation.push("Confirm whether the customer wants a new phone.");
  const unresolvedObjections = (report.concerns || []).map((item) => item.text);
  if (needs.budgetTarget == null && signals.priceObjection) unresolvedObjections.push("The acceptable monthly budget is not confirmed.");

  const cheapest = needs.budgetTarget == null
    ? recommend({ ...needs, budgetTarget: null }).recommendations.sort((a, b) => a.monthlyTotal - b.monthlyTotal)[0]
    : recommend({ ...needs, budgetTarget: budget }).recommendations.sort((a, b) => a.monthlyTotal - b.monthlyTotal)[0];
  const recommendedPlan = cheapest ? `${cheapest.plan.name}${cheapest.phone ? ` with ${cheapest.phone.brand} ${cheapest.phone.model}` : ""}` : null;
  const customerPriorities = [...new Set((report.customer_needs || []).flatMap((item) =>
    (item.evidence || []).map((entry) => entry.quote).filter((quote) => typeof quote === "string")
  ))].slice(0, 5);
  const followUp = createFollowUp({
    customerName: customer.name && customer.name !== customer.contact ? customer.name : "there",
    action: recommendedAction,
    customerPriorities,
    recommendedPlan,
    contactPreference: customer.confirmedChannel || customer.recommendedChannel,
    contactPermissionConfirmed: false
  });

  return {
    ...risk,
    signals,
    riskSignals,
    unresolvedObjections: [...new Set(unresolvedObjections)],
    recommendedAction,
    missingInformation,
    followUp
  };
}

module.exports = { buildDealRecovery };
