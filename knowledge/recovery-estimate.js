function estimateRecovery({ eligibleOpportunities, baselineRate, assumedUplift }) {
  const count = Number(eligibleOpportunities);
  const baseline = Number(baselineRate);
  const uplift = Number(assumedUplift);
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(baseline) ||
      !Number.isFinite(uplift) || baseline < 0 || baseline > 1 || uplift < 0 || baseline + uplift > 1) {
    throw new Error("Invalid scenario assumptions");
  }
  return {
    eligibleOpportunities: count,
    baselineRate: baseline,
    assumedUplift: uplift,
    scenarioRate: baseline + uplift,
    expectedBaselineCloses: count * baseline,
    expectedScenarioCloses: count * (baseline + uplift),
    expectedIncrementalCloses: count * uplift,
    label: "Assumption-based scenario — not validated by actual T-Mobile conversion data."
  };
}

module.exports = { estimateRecovery };
