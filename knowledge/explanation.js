function explainRecommendation(item, needs = {}) {
  const reasons = [];
  const tradeoffs = [...(item.tradeoffs || [])];
  const preferredOs = String(needs.osPreference || "Any").toLowerCase();

  if (item.phone) {
    if (preferredOs !== "any" && String(item.phone.os).toLowerCase() === preferredOs) {
      reasons.push(`Matches your ${item.phone.os} preference`);
    }
    if ((needs.usage || []).some((need) => (item.phone.features || []).includes(need))) {
      reasons.push("Supports at least one of your stated usage needs");
    }
    reasons.push(`Device payment: $${item.phone.monthlyPayment.toFixed(2)}/month`);
  }

  if ((needs.usage || []).some((need) => (item.plan.features || []).includes(need))) {
    reasons.push("Plan features match at least one stated usage need");
  }
  if (item.budgetFit?.withinBudget === true) {
    reasons.push(`Within your $${item.budgetFit.budget.toFixed(2)} monthly budget`);
  } else if (item.budgetFit?.withinBudget === null) {
    reasons.push("No monthly budget has been confirmed yet");
  }

  return { reasons, tradeoffs, budgetFit: item.budgetFit };
}

module.exports = { explainRecommendation };
