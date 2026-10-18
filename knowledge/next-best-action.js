function getNextBestAction(signals = {}) {
  if (signals.priceObjection || signals.recommendationOverBudget) return {
    type: "offer_lower_cost_option", priority: "high", channel: "email",
    reason: "The customer raised a price concern. Review a lower-cost option before contacting them."
  };
  if (signals.consideringCompetitor) return {
    type: "prepare_plan_comparison", priority: "high", channel: "email",
    reason: "The customer is considering alternatives. Prepare a clear comparison using verified demo data."
  };
  if (signals.needsTimeToThink) return {
    type: "send_personalized_recap", priority: "medium", channel: "message",
    reason: "The customer wants time to decide. A concise recap may help them revisit the options."
  };
  if (signals.agreedNextStep) return {
    type: "confirm_next_step", priority: "low", channel: "message",
    reason: "The customer agreed to a next step. Confirm the details."
  };
  return {
    type: "clarify_customer_needs", priority: "low", channel: "none",
    reason: "There is not enough evidence to recommend proactive outreach."
  };
}

module.exports = { getNextBestAction };
