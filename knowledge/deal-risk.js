const RISK_WEIGHTS = {
  priceObjection: 25,
  consideringCompetitor: 30,
  needsTimeToThink: 15,
  recommendationOverBudget: 20,
  positiveBuyingIntent: -15,
  agreedNextStep: -10
};

function calculateDealRisk(signals = {}) {
  let score = 20;
  for (const [signal, weight] of Object.entries(RISK_WEIGHTS)) {
    if (signals[signal] === true) score += weight;
  }
  score = Math.max(0, Math.min(100, score));
  const dealStatus = score >= 60 ? "at_risk" : score <= 30 ? "low_risk" : "uncertain";
  return {
    dealRiskScore: score,
    dealStatus,
    scoringMethod: "heuristic_demo",
    scoreExplanation: "Rule-based score using predefined demo weights. Not a measured close probability."
  };
}

module.exports = { calculateDealRisk };
